// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollKeyboardDelegation.test.ts
 * @input Private delegation behavior, explicit visibility, and focus event sequences
 * @output Eligibility, keyboard intent, observer cost, and cleanup regressions
 * @position DOM-level policy proof; browser tests own native Tab and scroll evidence
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {attachScrollKeyboardDelegation} from './scrollKeyboardDelegation';
import {FOCUSABLE_SELECTOR} from './focusableSelector';

let detach: (() => void) | undefined;
let before: HTMLButtonElement;
let viewport: HTMLDivElement;
let content: HTMLDivElement;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 20, 20),
  ] as unknown as DOMRectList);
  before = document.createElement('button');
  viewport = document.createElement('div');
  viewport.tabIndex = 0;
  content = document.createElement('div');
  viewport.append(content);
  // The pinned jsdom selector engine orders this comma-separated selector by
  // selector group. Browsers return document order; normalize only the emulator.
  const query = content.querySelectorAll.bind(content);
  vi.spyOn(content, 'querySelectorAll').mockImplementation(selector => {
    const result = query(selector);
    return selector === FOCUSABLE_SELECTOR
      ? ([...result].sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
        ) as unknown as NodeListOf<Element>)
      : result;
  });
  document.body.append(before, viewport);
  detach = attachScrollKeyboardDelegation(viewport, content);
});

afterEach(() => {
  detach?.();
  before.remove();
  viewport.remove();
  vi.restoreAllMocks();
});

// jsdom supplies no Tab default action. Complete dispatch before focusing to
// model the browser's event boundary; real traversal is tested in both engines.
function enter() {
  before.focus();
  before.dispatchEvent(
    new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}),
  );
  viewport.focus();
}

describe('scroll keyboard delegation', () => {
  it('inspects content only on keyboard entry and leaves mutation observation untouched', () => {
    content.innerHTML = '<button>Action</button>';
    const scan = vi.spyOn(content, 'querySelectorAll');
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    viewport.focus();
    content.firstElementChild?.setAttribute('data-state', 'changed');
    viewport.dispatchEvent(new Event('scroll'));
    expect(scan).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    enter();
    expect(scan).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(content.firstElementChild);
    expect(viewport.tabIndex).toBe(0);
  });

  it.each([
    '<input aria-label="Input"><button>Later action</button>',
    '<button role="radio">Radio</button><button>Later action</button>',
    '<div role="toolbar"><button>Toolbar action</button></div>',
    '<div contenteditable="true"><button>Editor action</button></div>',
    '<button aria-haspopup="menu">Open menu</button>',
    '<button aria-disabled="true">Unavailable</button>',
    '<button aria-hidden="true">Hidden from AT</button><button>Later action</button>',
    '<button>Zero</button><button tabindex="1">Earlier positive stop</button>',
    '<div tabindex="0">Custom target</div><button>Later action</button>',
  ])('does not skip an excluded first target: %s', markup => {
    content.innerHTML = markup;
    enter();
    expect(document.activeElement).toBe(viewport);
  });

  it.each(['disabled', 'hidden', 'tabindex="-2"', 'style="visibility:hidden"'])(
    'skips a nonsequential target (%s)',
    attributes => {
      content.innerHTML = `<button ${attributes}>Skipped</button><button>Action</button>`;
      enter();
      expect(document.activeElement).toBe(content.lastElementChild);
    },
  );

  it('rechecks ancestor eligibility on the next entry', () => {
    content.innerHTML = '<div><button>Action</button></div>';
    enter();
    expect(document.activeElement).toBe(content.querySelector('button'));
    content.firstElementChild?.setAttribute('role', 'menu');
    enter();
    expect(document.activeElement).toBe(viewport);
  });

  it('retains programmatic focus during a Tab handler even without preventDefault', () => {
    content.innerHTML = '<button>Action</button>';
    before.addEventListener('keydown', () => viewport.focus(), {once: true});
    before.focus();
    before.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Tab', bubbles: true}),
    );
    expect(document.activeElement).toBe(viewport);
  });

  it('does not retain canceled keyboard intent', () => {
    content.innerHTML = '<button>Action</button>';
    before.addEventListener('keydown', event => event.preventDefault(), {
      once: true,
    });
    before.focus();
    before.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true,
      }),
    );
    viewport.focus();
    expect(document.activeElement).toBe(viewport);
  });

  it('restores the skipped viewport on cancellation and cleans up pending work', () => {
    content.innerHTML = '<button>Action</button><button>Last</button>';
    enter();
    const first = content.firstElementChild as HTMLElement;
    (content.lastElementChild as HTMLElement).focus();
    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true}),
    );
    expect(viewport.tabIndex).toBe(-1);
    detach?.();
    detach = undefined;
    expect(viewport.tabIndex).toBe(0);
    enter();
    expect(document.activeElement).toBe(viewport);
  });
});

describe('a viewport that is its own content box', () => {
  function attachToItself(markup: string) {
    detach?.();
    viewport.innerHTML = markup;
    const query = viewport.querySelectorAll.bind(viewport);
    vi.spyOn(viewport, 'querySelectorAll').mockImplementation(selector => {
      const result = query(selector);
      return selector === FOCUSABLE_SELECTOR
        ? ([...result].sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
              ? -1
              : 1,
          ) as unknown as NodeListOf<Element>)
        : result;
    });
    detach = attachScrollKeyboardDelegation(viewport, viewport);
  }

  it('delegates Tab entry to its first link or button, never to itself', () => {
    attachToItself(
      '<p>Text</p><a href="#first">First link</a><button>Later</button>',
    );
    enter();
    expect(document.activeElement).toBe(viewport.querySelector('a'));
  });

  it('keeps the stop on itself when nothing inside is focusable', () => {
    attachToItself('<p>Only text</p>');
    enter();
    expect(document.activeElement).toBe(viewport);
  });
});
