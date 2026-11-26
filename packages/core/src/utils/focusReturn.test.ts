// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach, beforeEach, vi} from 'vitest';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {
  focusForLastInput,
  focusForLastInputTemporarily,
  releaseTemporaryFocus,
  isFocusLost,
  isFocusUnclaimed,
  moveFocusLeftBehind,
  noteFocusWithin,
  ownsFocus,
  prepareFocusReturnOnRemoval,
  returnFocusForLastInput,
  takesFocusAsIs,
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

describe('takesFocusAsIs', () => {
  const hosts: HTMLElement[] = [];
  function make(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    hosts.push(host);
    return host.firstElementChild as HTMLElement;
  }
  afterEach(() => {
    hosts.splice(0).forEach(host => host.remove());
  });

  it.each([
    ['a button', '<button>Go</button>'],
    ['an element made focusable with tabindex', '<div tabindex="-1">Row</div>'],
    ['an editable region', '<div contenteditable="true">Text</div>'],
    ['a media element with controls', '<audio controls></audio>'],
  ])('is true for %s', (_name, html) => {
    expect(takesFocusAsIs(make(html))).toBe(true);
  });

  it('is false for a box that is only a place to sit', () => {
    expect(takesFocusAsIs(make('<div>Card</div>'))).toBe(false);
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

describe('returnFocusForLastInput reveal', () => {
  // jsdom lays nothing out and has no scrollIntoView. Each case gives the
  // opener a box and records the reveal.
  let reveal: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    reveal = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: reveal,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    document.body.innerHTML = '';
  });

  function opener(
    html: string,
    box: {width: number; height: number} = {width: 80, height: 32},
  ): HTMLElement {
    document.body.innerHTML = html;
    const element = document.querySelector<HTMLElement>('[data-opener]');
    if (element == null) {
      throw new Error('no opener');
    }
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      ...box,
      top: 0,
      left: 0,
      right: box.width,
      bottom: box.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    return element;
  }

  it('scrolls a Tab-stop opener just into view, to its nearest edge', () => {
    const element = opener('<button data-opener>Open</button>');
    returnFocusForLastInput(element);
    expect(document.activeElement).toBe(element);
    expect(reveal.mock.calls).toEqual([
      [{block: 'nearest', inline: 'nearest'}],
    ]);
  });

  it('never scrolls to an opener that is not a Tab stop', () => {
    const element = opener('<div data-opener tabindex="-1">Region</div>');
    returnFocusForLastInput(element);
    expect(document.activeElement).toBe(element);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('does not scroll a Tab-stop opener taller than the viewport', () => {
    const element = opener(
      '<div data-opener tabindex="0">Table viewport</div>',
      {width: 80, height: window.innerHeight + 1},
    );
    returnFocusForLastInput(element);
    expect(document.activeElement).toBe(element);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('does not scroll a Tab-stop opener taller than the scroller around it', () => {
    const element = opener(
      '<div style="overflow-x: auto; overflow-y: auto"><button data-opener>Open</button></div>',
    );
    const scroller = element.parentElement as HTMLElement;
    vi.spyOn(scroller, 'clientHeight', 'get').mockReturnValue(20);
    vi.spyOn(scroller, 'clientWidth', 'get').mockReturnValue(200);
    returnFocusForLastInput(element);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('does not scroll an opener that a box with overflow hidden clips', () => {
    const element = opener(
      '<div style="overflow-x: hidden; overflow-y: hidden"><button data-opener>Open</button></div>',
    );
    const track = element.parentElement as HTMLElement;
    // The track shows 0 to 20; the opener's box (0 to 32) runs past it.
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 20,
      top: 0,
      left: 0,
      right: 200,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    returnFocusForLastInput(element);
    expect(document.activeElement).toBe(element);
    expect(reveal).not.toHaveBeenCalled();
  });

  it('scrolls an opener that a box with overflow hidden shows in full', () => {
    const element = opener(
      '<div style="overflow-x: hidden; overflow-y: hidden"><button data-opener>Open</button></div>',
    );
    const track = element.parentElement as HTMLElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    returnFocusForLastInput(element);
    expect(reveal).toHaveBeenCalledOnce();
  });

  it('does not scroll when the opener did not take focus', () => {
    const element = opener('<button data-opener disabled>Open</button>');
    returnFocusForLastInput(element);
    expect(document.activeElement).not.toBe(element);
    expect(reveal).not.toHaveBeenCalled();
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
    vi.restoreAllMocks();
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

  it('returns focus within an unfocused cross-origin document after removal', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    vi.spyOn(doc.defaultView!, 'frameElement', 'get').mockReturnValue(null);
    const hasFocus = vi.spyOn(doc, 'hasFocus').mockReturnValue(true);
    const opener = doc.createElement('button');
    const surface = doc.createElement('div');
    const inside = doc.createElement('button');
    surface.append(inside);
    doc.body.append(opener, surface);
    inside.focus();
    const returnOnRemoval = prepareFocusReturnOnRemoval(surface);

    hasFocus.mockReturnValue(false);
    returnOnRemoval(opener);
    surface.remove();
    await Promise.resolve();
    expect(doc.activeElement).toBe(opener);
  });
});

describe('isFocusUnclaimed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('reads a shadow root without taking focus from its host or a sibling', () => {
    const host = document.createElement('div');
    host.tabIndex = -1;
    document.body.append(host);
    const root = host.attachShadow({mode: 'open'});
    const surface = document.createElement('div');
    const inside = document.createElement('button');
    const outside = document.createElement('button');
    surface.append(inside);
    root.append(surface, outside);

    inside.focus();
    expect(isFocusUnclaimed(surface)).toBe(false);
    outside.focus();
    expect(isFocusUnclaimed(surface)).toBe(false);
    outside.blur();
    expect(isFocusUnclaimed(surface)).toBe(true);
    host.focus();
    expect(root.activeElement).toBeNull();
    expect(isFocusUnclaimed(surface)).toBe(false);
  });

  it('does not treat a document with a named host as a shadow root', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    const form = doc.createElement('form');
    form.name = 'host';
    const target = doc.createElement('button');
    doc.body.append(form, target);
    Object.defineProperty(doc, 'host', {value: form, configurable: true});

    target.focus();
    expect(ownsFocus(target)).toBe(true);
    expect(isFocusUnclaimed(doc)).toBe(false);
    target.remove();
    expect(isFocusUnclaimed(doc)).toBe(true);
  });

  it('preserves focus outside a nested frame even when its document is detached', () => {
    const outer = document.createElement('iframe');
    const outside = document.createElement('button');
    document.body.append(outer, outside);
    const outerDocument = outer.contentDocument!;
    const inner = outerDocument.createElement('iframe');
    outerDocument.body.append(inner);
    const innerDocument = inner.contentDocument!;
    const target = innerDocument.createElement('button');
    innerDocument.body.append(target);

    target.focus();
    expect(isFocusUnclaimed(innerDocument)).toBe(false);
    target.remove();
    expect(isFocusUnclaimed(innerDocument)).toBe(true);
    outside.focus();
    expect(isFocusUnclaimed(innerDocument)).toBe(false);
  });

  it('keeps document-local ownership in an unfocused child with an inaccessible parent', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument!;
    vi.spyOn(doc.defaultView!, 'frameElement', 'get').mockReturnValue(null);
    vi.spyOn(doc, 'hasFocus').mockReturnValue(false);
    const target = doc.createElement('button');
    doc.body.append(target);

    target.focus();
    expect(ownsFocus(target)).toBe(true);
    expect(isFocusUnclaimed(doc)).toBe(false);
    target.remove();
    expect(isFocusUnclaimed(doc)).toBe(true);
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
