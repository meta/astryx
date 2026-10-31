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
import {
  lockDragSelection,
  lockSelection,
  locksSelectionFor,
  selectionRangesOf,
  startsOnSelectableText,
} from './selectionLock';

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

/** Select all of `node`. */
function select(node: Node): Selection {
  const selection = window.getSelection() as Selection;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.addRange(range);
  return selection;
}

describe('lockDragSelection (spec:AST-094 FR41)', () => {
  it('keeps the selection the press began with: what replaces it goes back, a new one is refused on the elements and the document, and the document refuses one until a task after the lift', async () => {
    const get = mount(
      '<p id="text">Text the page selected</p><div id="pan">Pan</div>',
    );
    const selection = select(get('text'));
    const kept = selectionRangesOf(window);
    selection.collapseToStart();
    const onReleased = vi.fn();
    const release = lockDragSelection([get('pan')], window, kept, onReleased);
    expect(selection.toString()).toBe('Text the page selected');
    expect(refuses(get('pan'))).toBe(true);
    expect(refuses(get('text'))).toBe(true);
    select(get('pan'));
    document.dispatchEvent(new Event('selectionchange'));
    expect(selection.toString()).toBe('Text the page selected');
    release();
    expect(refuses(get('text'))).toBe(true);
    expect(onReleased).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(refuses(get('text'))).toBe(false);
    expect(refuses(get('pan'))).toBe(false);
    expect(onReleased).toHaveBeenCalledTimes(1);
    expect(selection.toString()).toBe('Text the page selected');
  });

  it('takes away a selection the drag made when the page had none', () => {
    const get = mount('<div id="pan">Pan text</div>');
    window.getSelection()?.removeAllRanges();
    const kept = selectionRangesOf(window);
    expect(kept).toEqual([]);
    const selection = select(get('pan'));
    const release = lockDragSelection([get('pan')], window, kept);
    expect(selection.rangeCount).toBe(0);
    release({isCancel: true});
  });

  it('ends at once at a cancel, and a cancel after a lift ends its last task at once; onReleased runs once', () => {
    const get = mount('<p id="text">Text</p><div id="pan">Pan</div>');
    const cancelled = vi.fn();
    lockDragSelection([get('pan')], window, [], cancelled)({isCancel: true});
    expect(refuses(get('text'))).toBe(false);
    expect(cancelled).toHaveBeenCalledTimes(1);
    const lifted = vi.fn();
    const release = lockDragSelection([get('pan')], window, [], lifted);
    release();
    expect(refuses(get('text'))).toBe(true);
    release({isCancel: true});
    expect(refuses(get('text'))).toBe(false);
    release({isCancel: true});
    expect(lifted).toHaveBeenCalledTimes(1);
  });

  it('leaves a focused text field its own selection', () => {
    const get = mount(
      '<input id="field" value="typed words"><div id="pan">Pan</div>',
    );
    const field = get('field') as HTMLInputElement;
    field.focus();
    const text = document.createElement('p');
    text.textContent = 'Page text';
    document.body.append(text);
    const selection = select(text);
    const release = lockDragSelection([get('pan')], window, []);
    expect(selection.toString()).toBe('Page text');
    expect(refuses(field)).toBe(false);
    release({isCancel: true});
  });
});

describe('startsOnSelectableText (spec:AST-094 FR41)', () => {
  /** The caret query lands at `offset` in `node`, and each character's box is `rect`. */
  function caretAt(
    node: Node,
    offset: number,
    rect: {left: number; right: number; top: number; bottom: number},
  ): void {
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        return range;
      },
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [rect],
    });
  }

  afterEach(() => {
    delete (document as {caretRangeFromPoint?: unknown}).caretRangeFromPoint;
    delete (Range.prototype as {getClientRects?: unknown}).getClientRects;
  });

  it('answers yes on a character of text, and on a text field', () => {
    const get = mount('<p id="text">Selectable words</p><input id="field">');
    caretAt(get('text').firstChild as Text, 3, {
      left: 0,
      right: 50,
      top: 0,
      bottom: 20,
    });
    expect(startsOnSelectableText(document, 10, 10, get('text'))).toBe(true);
    expect(startsOnSelectableText(document, 400, 400, get('field'))).toBe(true);
  });

  it('answers no beside text the caret query snaps to, on whitespace, on text that refuses a selection, and where the engine has no caret query', () => {
    const get = mount('<p id="text">Selectable words</p><p id="blank">   </p>');
    const text = get('text').firstChild as Text;
    caretAt(text, 3, {left: 0, right: 50, top: 0, bottom: 20});
    expect(startsOnSelectableText(document, 200, 10, get('text'))).toBe(false);
    caretAt(get('blank').firstChild as Text, 1, {
      left: 0,
      right: 50,
      top: 0,
      bottom: 20,
    });
    expect(startsOnSelectableText(document, 10, 10, get('blank'))).toBe(false);
    caretAt(text, 3, {left: 0, right: 50, top: 0, bottom: 20});
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (name: string) =>
        name === 'user-select' ? 'none' : '',
    } as unknown as CSSStyleDeclaration);
    expect(startsOnSelectableText(document, 10, 10, get('text'))).toBe(false);
    vi.restoreAllMocks();
    delete (document as {caretRangeFromPoint?: unknown}).caretRangeFromPoint;
    expect(startsOnSelectableText(document, 10, 10, get('text'))).toBe(false);
  });
});
