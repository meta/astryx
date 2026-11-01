// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach, beforeEach, vi} from 'vitest';
import {focusForLastInput} from './focusReturn';
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
