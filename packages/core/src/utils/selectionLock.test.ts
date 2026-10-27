// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionLock.test.ts
 * @input lockSelection on the elements a hold acts on, in jsdom, with and
 *   without iOS WebKit's touch callout
 * @output A hold that acts starts no selection and no callout, a link's
 *   callout included (`spec:AST-094` FR41, DEC-9). Where iOS WebKit runs the
 *   lock is a style; elsewhere `selectstart` is cancelled and no style is
 *   written
 * @position Unit tests for utils/selectionLock.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {lockSelection, locksSelectionFor} from './selectionLock';

/** Make `CSS.supports` answer as iOS WebKit does for its touch callout. */
function asIosWebKit(): () => void {
  const original = globalThis.CSS;
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {
      ...original,
      supports: (query: string) => query === '(-webkit-touch-callout: none)',
    },
  });
  return () => {
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: original,
    });
  };
}

function mount(html: string): (id: string) => HTMLElement {
  document.body.innerHTML = html;
  return id => document.getElementById(id) as HTMLElement;
}

/** Whether a selection starting on `target` was refused. */
function refuses(target: Element): boolean {
  const event = new Event('selectstart', {bubbles: true, cancelable: true});
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('lockSelection where iOS WebKit runs', () => {
  it("suppresses a link's touch callout when its hold acts, under the link too (spec:AST-094 FR41, DEC-9)", () => {
    const restore = asIosWebKit();
    try {
      const get = mount(
        '<a id="row" href="/next"><span id="label">Next</span></a>',
      );
      const set = vi.spyOn(get('row').style, 'setProperty');
      const release = lockSelection([get('row')], get('label'));
      expect(set).toHaveBeenCalledWith('-webkit-touch-callout', 'none');
      expect(set).toHaveBeenCalledWith('user-select', 'none');
      release();
    } finally {
      restore();
    }
  });
});

describe('lockSelection elsewhere', () => {
  it('refuses a selection by cancelling selectstart, with no style write, until the release (spec:AST-094 FR41)', () => {
    const get = mount(
      '<div id="row"><span id="label">Row</span><input id="field" type="text"></div>',
    );
    const set = vi.spyOn(get('row').style, 'setProperty');
    const release = lockSelection([get('row')], get('label'));
    expect(set).not.toHaveBeenCalled();
    expect(refuses(get('label'))).toBe(true);
    // A text field keeps its selection: a held finger places its caret.
    expect(refuses(get('field'))).toBe(false);
    release();
    expect(refuses(get('label'))).toBe(false);
  });

  it('keeps refusing while any holder holds', () => {
    const get = mount('<div id="row"><span id="label">Row</span></div>');
    const first = lockSelection([get('row')], get('label'));
    const second = lockSelection([get('row')], get('label'));
    first();
    expect(refuses(get('label'))).toBe(true);
    second();
    expect(refuses(get('label'))).toBe(false);
  });
});

describe('locksSelectionFor', () => {
  it('locks for a finger and a pen under any primary pointer, a touchscreen laptop’s included, and never for a mouse (spec:AST-094 FR41)', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia');
    expect(locksSelectionFor('touch')).toBe(true);
    expect(locksSelectionFor('pen')).toBe(true);
    expect(locksSelectionFor('mouse')).toBe(false);
    // No pointer query decides it.
    expect(matchMedia).not.toHaveBeenCalled();
    matchMedia.mockRestore();
  });
});
