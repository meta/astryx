// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach, beforeEach, vi} from 'vitest';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {
  focusForLastInput,
  focusForLastInputTemporarily,
  releaseTemporaryFocus,
  isFocusLost,
  moveFocusLeftBehind,
  noteFocusWithin,
  returnFocusForLastInput,
} from './focusReturn';
import {isFocusDetached} from './isFocusDetached';
import {
  __resetInteractionModalityForTest,
  __startInteractionModalityTrackingForTest,
  __trackInteractionModalityInForTest,
} from './interactionModality';

describe('isFocusDetached', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true when focus rests on the body (Escape / empty-space dismiss)', () => {
    // Nothing focused → activeElement is <body>.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(isFocusDetached()).toBe(true);
  });

  it('is false when a real element holds focus (the user moved focus there)', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(isFocusDetached()).toBe(false);
  });

  it('treats the documentElement as detached', () => {
    const doc = {
      activeElement: document.documentElement,
      body: document.body,
      documentElement: document.documentElement,
    } as unknown as Document;
    expect(isFocusDetached(doc)).toBe(true);
  });

  it('treats a null activeElement as detached', () => {
    const doc = {
      activeElement: null,
      body: document.body,
      documentElement: document.documentElement,
    } as unknown as Document;
    expect(isFocusDetached(doc)).toBe(true);
  });
});

describe('focusForLastInput', () => {
  beforeEach(() => {
    __startInteractionModalityTrackingForTest();
    __resetInteractionModalityForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function button(): HTMLButtonElement {
    const element = document.createElement('button');
    document.body.appendChild(element);
    return element;
  }

  it('leaves the ring to the browser after keyboard input, passing the options through', () => {
    const element = button();
    const focus = vi.spyOn(element, 'focus');
    focusForLastInput(element);
    focusForLastInput(element, {preventScroll: true});
    expect(focus.mock.calls).toEqual([[], [{preventScroll: true}]]);
  });

  it('asks the browser for no ring after pointer input, keeping the options', () => {
    const element = button();
    document.dispatchEvent(new Event('pointerdown'));
    const focus = vi.spyOn(element, 'focus');
    focusForLastInput(element);
    focusForLastInput(element, {preventScroll: true});
    expect(focus.mock.calls).toEqual([
      [{focusVisible: false}],
      [{preventScroll: true, focusVisible: false}],
    ]);
  });

  it('keeps plain focus on a text field after pointer input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    document.dispatchEvent(new Event('pointerdown'));
    const focus = vi.spyOn(input, 'focus');
    focusForLastInput(input, {preventScroll: true});
    expect(focus.mock.calls).toEqual([[{preventScroll: true}]]);
  });

  it('clears a ring the browser already drew before refocusing after pointer input', () => {
    const element = button();
    element.focus();
    document.dispatchEvent(new Event('pointerdown'));
    const matches = HTMLElement.prototype.matches;
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
      this: HTMLElement,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? this === element
        : matches.call(this, selector);
    });
    const blur = vi.spyOn(element, 'blur');
    const focus = vi.spyOn(element, 'focus');
    focusForLastInput(element, {preventScroll: true});
    expect(blur).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls).toEqual([
      [{preventScroll: true, focusVisible: false}],
    ]);
    expect(blur.mock.invocationCallOrder[0]).toBeLessThan(
      focus.mock.invocationCallOrder[0] ?? 0,
    );
    expect(document.activeElement).toBe(element);
  });
});

describe('returnFocusForLastInput', () => {
  beforeEach(() => {
    __startInteractionModalityTrackingForTest();
    __resetInteractionModalityForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('returns focus without a scroll after keyboard input', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    const focus = vi.spyOn(opener, 'focus');
    returnFocusForLastInput(opener);
    expect(focus.mock.calls).toEqual([[{preventScroll: true}]]);
    expect(document.activeElement).toBe(opener);
  });

  it('returns focus without a scroll and without a ring after pointer input', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    document.dispatchEvent(new Event('pointerdown'));
    const focus = vi.spyOn(opener, 'focus');
    returnFocusForLastInput(opener);
    expect(focus.mock.calls).toEqual([
      [{preventScroll: true, focusVisible: false}],
    ]);
    expect(document.activeElement).toBe(opener);
  });

  it('takes the ring from the modality it is given', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    const focus = vi.spyOn(opener, 'focus');
    returnFocusForLastInput(opener, 'pointer');
    expect(focus.mock.calls).toEqual([
      [{preventScroll: true, focusVisible: false}],
    ]);
  });
});

describe('focusForLastInput in a second document', () => {
  it("follows the last input in the element's own document by default", () => {
    __startInteractionModalityTrackingForTest();
    const secondDocument = document.implementation.createHTMLDocument();
    const release = __trackInteractionModalityInForTest(secondDocument);
    const button = secondDocument.createElement('button');
    secondDocument.body.appendChild(button);
    const focus = vi.spyOn(button, 'focus');

    // The page's last input was a pointer; the button's document saw a key.
    document.dispatchEvent(new Event('pointerdown'));
    secondDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    focusForLastInput(button);
    expect(focus).toHaveBeenLastCalledWith();

    // And the other way round: the page saw a key, the button's document a
    // pointer, so the ring is suppressed.
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    secondDocument.dispatchEvent(new Event('pointerdown'));
    focusForLastInput(button);
    expect(focus).toHaveBeenLastCalledWith({focusVisible: false});
    release();
  });
});

describe('temporary programmatic focus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses the canonical focusable selector before acquiring a temporary tab stop', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const matches = vi.spyOn(target, 'matches');
    const dispose = focusForLastInputTemporarily(target);
    expect(matches).toHaveBeenCalledWith(FOCUSABLE_SELECTOR);
    expect(target).toHaveAttribute('tabindex', '-1');
    dispose();
    expect(target).not.toHaveAttribute('tabindex');
  });

  it('passes options and modality through and releases its attribute and listener on dispose', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const focus = vi.spyOn(target, 'focus');
    const remove = vi.spyOn(target, 'removeEventListener');
    const dispose = focusForLastInputTemporarily(
      target,
      {preventScroll: true},
      'pointer',
    );
    expect(target).toHaveFocus();
    expect(focus).toHaveBeenLastCalledWith({
      preventScroll: true,
      focusVisible: false,
    });
    expect(target).toHaveAttribute('tabindex', '-1');
    dispose();
    dispose();
    expect(target).not.toHaveAttribute('tabindex');
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it.each(['button', 'input', 'textarea', 'select'])(
    'preserves native %s focusability',
    tag => {
      const target = document.createElement(tag);
      document.body.append(target);
      const dispose = focusForLastInputTemporarily(target);
      expect(target).toHaveFocus();
      expect(target).not.toHaveAttribute('tabindex');
      dispose();
      expect(target).not.toHaveAttribute('tabindex');
    },
  );

  it.each(['-1', '0', '3'])('preserves authored tabindex %s', value => {
    const target = document.createElement('div');
    target.setAttribute('tabindex', value);
    document.body.append(target);
    const dispose = focusForLastInputTemporarily(target);
    expect(target).toHaveFocus();
    target.blur();
    dispose();
    releaseTemporaryFocus(target);
    expect(target).toHaveAttribute('tabindex', value);
  });

  it('keeps later authored changes and lets a newer focus owner survive old cleanup', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const first = focusForLastInputTemporarily(target);
    const second = focusForLastInputTemporarily(
      target,
      {preventScroll: true},
      'pointer',
    );
    first();
    expect(target).toHaveFocus();
    expect(target).toHaveAttribute('tabindex', '-1');
    target.setAttribute('tabindex', '2');
    second();
    expect(target).toHaveAttribute('tabindex', '2');
  });

  it('explicitly releases ownership after removal and can refocus with keyboard options', () => {
    const target = document.createElement('div');
    document.body.append(target);
    const focus = vi.spyOn(target, 'focus');
    focusForLastInputTemporarily(target, {preventScroll: true}, 'keyboard');
    expect(focus).toHaveBeenLastCalledWith({preventScroll: true});
    target.remove();
    releaseTemporaryFocus(target);
    expect(target).not.toHaveAttribute('tabindex');
    document.body.append(target);
    const dispose = focusForLastInputTemporarily(target);
    expect(target).toHaveFocus();
    dispose();
  });

  it('cleans a target that cannot take focus and explicit release is idempotent', () => {
    const target = document.createElement('div');
    const dispose = focusForLastInputTemporarily(target);
    expect(target).not.toHaveAttribute('tabindex');
    releaseTemporaryFocus(target);
    dispose();
    expect(target).not.toHaveAttribute('tabindex');
  });

  it('lets a removal caller preserve scroll through the optional focus options', () => {
    const container = document.createElement('div');
    const inside = document.createElement('button');
    container.append(inside);
    document.body.append(container);
    inside.focus();
    const note = noteFocusWithin(container);
    inside.remove();
    const focus = vi.spyOn(container, 'focus');
    expect(
      moveFocusLeftBehind(note, container, null, {preventScroll: true}),
    ).toBe(true);
    expect(focus.mock.calls.at(-1)?.[0]).toMatchObject({preventScroll: true});
    releaseTemporaryFocus(container);
    expect(container).not.toHaveAttribute('tabindex');
  });
});

describe('isFocusLost', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is true when nothing is focused, or focus is inside the surface', () => {
    document.body.innerHTML =
      '<div id="surface"><button id="inside">In</button></div><button id="outside">Out</button>';
    const surface = document.getElementById('surface');
    expect(isFocusLost(surface)).toBe(true);
    document.getElementById('inside')?.focus();
    expect(isFocusLost(surface)).toBe(true);
    document.getElementById('outside')?.focus();
    expect(isFocusLost(surface)).toBe(false);
    expect(isFocusLost(null)).toBe(false);
  });
});

describe('noteFocusWithin and moveFocusLeftBehind', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setUp() {
    document.body.innerHTML =
      '<div id="container"><div id="content"><button id="inside">In</button></div><button id="target">Target</button></div><button id="outside">Out</button>';
    const byId = (id: string) => document.getElementById(id) as HTMLElement;
    return {
      container: byId('container'),
      content: byId('content'),
      inside: byId('inside'),
      target: byId('target'),
      outside: byId('outside'),
    };
  }

  it('notes focus only inside the container', () => {
    const {container, inside, outside} = setUp();
    inside.focus();
    expect(noteFocusWithin(container)?.element).toBe(inside);
    outside.focus();
    expect(noteFocusWithin(container)).toBeNull();
  });

  it('moves focus that fell to the page when its element was removed', () => {
    const {container, inside, target} = setUp();
    inside.focus();
    const note = noteFocusWithin(container);
    inside.remove();
    expect(moveFocusLeftBehind(note, target)).toBe(true);
    expect(target).toHaveFocus();
  });

  it('moves focus left on content the change hid but kept', () => {
    const {container, content, inside, target} = setUp();
    inside.focus();
    const note = noteFocusWithin(container);
    content.style.display = 'none';
    expect(moveFocusLeftBehind(note, target, content)).toBe(true);
    expect(target).toHaveFocus();
  });

  it('returns focus to an otherwise unfocusable container after removal', () => {
    const {container, inside, outside} = setUp();
    inside.focus();
    const note = noteFocusWithin(container);
    inside.remove();
    expect(moveFocusLeftBehind(note, container)).toBe(true);
    expect(container).toHaveFocus();
    expect(container).toHaveAttribute('tabindex', '-1');
    outside.focus();
    expect(container).not.toHaveAttribute('tabindex');
  });

  it('preserves focus the caller chose after the noted element was removed', () => {
    const {container, inside, target, outside} = setUp();
    inside.focus();
    const note = noteFocusWithin(container);
    inside.remove();
    outside.focus();
    expect(moveFocusLeftBehind(note, target)).toBe(false);
    expect(outside).toHaveFocus();
  });

  it('moves no focus that survived the change or was never inside', () => {
    const {container, inside, target, outside} = setUp();
    inside.focus();
    expect(moveFocusLeftBehind(noteFocusWithin(container), target)).toBe(false);
    expect(inside).toHaveFocus();
    outside.focus();
    expect(moveFocusLeftBehind(noteFocusWithin(container), target)).toBe(false);
    expect(outside).toHaveFocus();
  });
});
