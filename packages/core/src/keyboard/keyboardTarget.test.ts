// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardTarget.test.ts
 * @input keyboardTarget.ts, a stand-in visual viewport, stubbed boxes and a
 *   coarse pointer
 * @output Tests for the keyboard targets: where a field is, the reveal by its
 *   scroller, the docked ride, the stand-down inside a target and the claim
 * @position Keyboard module tests
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act} from '@testing-library/react';
import {animatorFor} from '../motion/animator';
import {__resetLayoutViewportForTest} from '../utils/layoutViewport';
import {getResizedRoom, watchRevealPan} from './keyboardHeight';
import {
  FIELD_OFFSET,
  coveredBy,
  dockedAncestor,
  followKeyboard,
  followsKeyboard,
  keepFieldAboveKeyboard,
  nearestScroller,
  registerKeyboardTarget,
} from './keyboardTarget';

type FakeViewport = EventTarget & {
  height: number;
  offsetTop: number;
  scale: number;
};

let viewport: FakeViewport;
let isCoarse = true;
const stops: (() => void)[] = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

/** Runs the frames the module asked for, as the browser does before paint. */
function runFrames() {
  act(() => {
    for (let round = 0; round < 5 && frames.size > 0; round++) {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) {
        callback(performance.now());
      }
    }
  });
}

/** The keyboard now covers `cover` px of the layout viewport's bottom. */
function keyboard(cover: number) {
  viewport.height = window.innerHeight - cover;
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });
  runFrames();
}

/** A touch event that leaves `fingers` touches on the screen. */
function touchEvent(type: string, fingers: number): Event {
  return Object.assign(new Event(type, {bubbles: true}), {
    touches: Array.from({length: fingers}, () => ({})),
  });
}

/** Focuses `element`, then lets the next frame run. */
function focusOn(element: HTMLElement) {
  act(() => element.focus());
  runFrames();
}

// A box laid out from `data-top` and `data-height`, moved by its own inline
// translate and its ancestors', as a browser draws a ridden element.
function translateY(element: Element | null): number {
  let y = 0;
  for (
    let node = element;
    node instanceof HTMLElement;
    node = node.parentElement
  ) {
    const match = /^\S+\s+(-?[\d.]+)px/.exec(node.style.translate);
    y += match == null ? 0 : Number(match[1]);
    // A transform the app sets, as the matrix a browser computes.
    const matrix = /^matrix\(([^)]*)\)$/.exec(node.style.transform);
    y += matrix == null ? 0 : Number((matrix[1] ?? '').split(',')[5]);
  }
  return y;
}

// How far the element's scrolling ancestors have scrolled it up.
function scrolledBy(element: Element): number {
  let y = 0;
  for (
    let node = element.parentElement;
    node != null;
    node = node.parentElement
  ) {
    if (node.hasAttribute('data-top')) {
      y += node.scrollTop;
    }
  }
  return y;
}

function boxOf(element: Element): DOMRect {
  const top = Number(element.getAttribute('data-top') ?? 0);
  const height = Number(element.getAttribute('data-height') ?? 0);
  const y = top + translateY(element) - scrolledBy(element);
  return new DOMRect(0, y, 300, height);
}

function element(
  tag: string,
  box: {top: number; height: number} | null,
  style: Partial<CSSStyleDeclaration> = {},
): HTMLElement {
  const node = document.createElement(tag);
  if (box != null) {
    node.setAttribute('data-top', String(box.top));
    node.setAttribute('data-height', String(box.height));
  }
  Object.assign(node.style, style);
  return node;
}

function track(stop: () => void) {
  stops.push(stop);
  return stop;
}

beforeEach(() => {
  isCoarse = true;
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  viewport = Object.assign(new EventTarget(), {
    height: window.innerHeight,
    offsetTop: 0,
    scale: 1,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer: coarse') ? isCoarse : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return boxOf(this);
    },
  );
  // A fixed element scrolled into view pans the visual viewport to its top,
  // as in Chrome for Android.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(function (this: HTMLElement) {
      if (this.style.position === 'fixed') {
        viewport.offsetTop = parseFloat(this.style.top) || 0;
      }
    }),
  });
  pageScrollRange(3000);
});

/** The page's own scroll range: its content `height` in a viewport-tall box. */
function pageScrollRange(height: number) {
  const page = document.scrollingElement ?? document.documentElement;
  Object.defineProperty(page, 'scrollHeight', {
    configurable: true,
    value: height,
  });
  Object.defineProperty(page, 'clientHeight', {
    configurable: true,
    value: window.innerHeight,
  });
}

afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  document.body.innerHTML = '';
  const page = document.scrollingElement ?? document.documentElement;
  Reflect.deleteProperty(page, 'scrollHeight');
  Reflect.deleteProperty(page, 'clientHeight');
  Reflect.deleteProperty(window, 'visualViewport');
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  __resetLayoutViewportForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('followsKeyboard', () => {
  it('holds for a top-level document with a visual viewport under a coarse pointer, and nowhere else', () => {
    expect(followsKeyboard(window)).toBe(true);
    expect(followsKeyboard(null)).toBe(false);
    // A fine primary pointer: a desktop browser.
    isCoarse = false;
    expect(followsKeyboard(window)).toBe(false);
    isCoarse = true;
    // No visual viewport: nothing measures the keyboard.
    Reflect.deleteProperty(window, 'visualViewport');
    expect(followsKeyboard(window)).toBe(false);
  });
});

describe('where a field is', () => {
  it('finds its nearest scroller, or else the document', () => {
    const list = element('div', {top: 0, height: 400}, {overflowY: 'auto'});
    const input = element('input', {top: 100, height: 40});
    list.append(input);
    document.body.append(list);
    Object.defineProperty(list, 'scrollHeight', {value: 900});
    Object.defineProperty(list, 'clientHeight', {value: 400});
    expect(nearestScroller(input)).toBe(list);

    const loose = element('input', {top: 100, height: 40});
    document.body.append(loose);
    expect(nearestScroller(loose)).toBe(
      document.scrollingElement ?? document.documentElement,
    );
  });

  it("counts a fixed bar whose bottom sits at the viewport's bottom as docked, and not one floating above it", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    expect(dockedAncestor(input)).toBe(bar);

    const floating = element(
      'div',
      {top: bottom - 70, height: 50},
      {position: 'fixed'},
    );
    const inner = element('input', {top: bottom - 65, height: 40});
    floating.append(inner);
    document.body.append(floating);
    expect(dockedAncestor(inner)).toBeNull();
  });

  it('never counts a container that fills the viewport, or a fixed header at the top, as docked', () => {
    const dialog = element(
      'div',
      {top: 0, height: window.innerHeight},
      {position: 'fixed'},
    );
    const field = element('input', {top: 600, height: 40});
    dialog.append(field);
    const header = element('div', {top: 0, height: 60}, {position: 'fixed'});
    const search = element('input', {top: 10, height: 40});
    header.append(search);
    document.body.append(dialog, header);
    expect(dockedAncestor(field)).toBeNull();
    expect(dockedAncestor(search)).toBeNull();
  });

  it('measures how far an edge sits under the keyboard, with the offset, and nothing without a keyboard', () => {
    const top = window.innerHeight - 300;
    expect(coveredBy(top + 10, 300, 0, window)).toBe(10);
    expect(coveredBy(top - 30, 300, FIELD_OFFSET, window)).toBe(0);
    expect(coveredBy(top, 300, FIELD_OFFSET, window)).toBe(FIELD_OFFSET);
    expect(coveredBy(window.innerHeight, 0, FIELD_OFFSET, window)).toBe(0);
  });
});

describe('keepFieldAboveKeyboard', () => {
  it('scrolls the page until a field in it sits the offset above the keyboard, in the report itself', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: 660, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const keyboardTop = window.innerHeight - 300;
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({
      top: 700 + FIELD_OFFSET - keyboardTop,
      behavior: 'instant',
    });
  });

  it('scrolls its own scroller when it sits in one, and leaves the page alone', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    Object.defineProperty(list, 'scrollHeight', {value: 2000});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    const input = element('input', {top: 600, height: 40});
    list.append(input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(list.scrollTop).toBe(
      640 + FIELD_OFFSET - (window.innerHeight - 300),
    );
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("reveals at a change of the keyboard's height, not at a report of the same height, so a field the person scrolled away stays there", () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    Object.defineProperty(list, 'scrollHeight', {value: 2000});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    const input = element('input', {top: 600, height: 40});
    list.append(input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(list.scrollTop).toBe(
      640 + FIELD_OFFSET - (window.innerHeight - 300),
    );
    // The person scrolls the list back, so the field sits under the keyboard.
    // The visual viewport then reports a scroll at the same keyboard height.
    list.scrollTop = 0;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    runFrames();
    expect(list.scrollTop).toBe(0);
    // A zoom moves the measured height by under a pixel: still no reveal.
    keyboard(300.4);
    expect(list.scrollTop).toBe(0);
    // A change of the keyboard's height reveals the field again.
    keyboard(320);
    expect(list.scrollTop).toBe(
      640 + FIELD_OFFSET - (window.innerHeight - 320),
    );
  });

  it("claims a field that its scroll area cannot scroll up to the area's own top, and reveals it through the document and a pan", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    // The list has 140 px of range left, and the field sits 660 px down it.
    Object.defineProperty(list, 'scrollHeight', {value: 900});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    let listTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => listTop,
      set: (value: number) => {
        listTop = Math.min(140, Math.max(0, value));
      },
    });
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: 660, height: 40});
    list.append(other, input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    // The list scrolls its last 140 px; the document does not move; a pan does.
    expect(list.scrollTop).toBe(140);
    const keyboardTop = window.innerHeight - 300;
    const need = 700 - 140 + FIELD_OFFSET - keyboardTop;
    expect(scrollBy).toHaveBeenCalledWith({top: need, behavior: 'instant'});
    expect(viewport.offsetTop).toBe(need);
    expect(input.getBoundingClientRect().bottom - viewport.offsetTop).toBe(
      keyboardTop - FIELD_OFFSET,
    );
  });

  it("claims a field that its scroll area can just scroll up to the area's own top, and reveals it there", () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    // 660 px of range left: the field at 660 can reach the list's top.
    Object.defineProperty(list, 'scrollHeight', {value: 1420});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: 660, height: 40});
    list.append(other, input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    expect(list.scrollTop).toBe(
      700 + FIELD_OFFSET - (window.innerHeight - 300),
    );
  });

  // A scroll area low on the page. Its box ends under a 300 px keyboard's
  // top, and it has a field 20 px down it with range to spare.
  function lowScrollArea() {
    const bottom = window.innerHeight;
    const list = element(
      'div',
      {top: bottom - 268, height: 220},
      {overflowY: 'auto'},
    );
    Object.defineProperty(list, 'scrollHeight', {value: 900});
    Object.defineProperty(list, 'clientHeight', {value: 220});
    const input = element('input', {top: bottom - 248, height: 40});
    list.append(input);
    return {list, input};
  }

  it('reveals through the document a field whose scroll area sits under the keyboard, and pans the visual viewport where the document does not move', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const {list, input} = lowScrollArea();
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    // The list cannot bring the field above the keyboard: the document does.
    expect(list.scrollTop).toBe(0);
    const bottom = window.innerHeight;
    const need = bottom - 208 + FIELD_OFFSET - (bottom - 300);
    expect(scrollBy).toHaveBeenCalledWith({top: need, behavior: 'instant'});
    // The document does not move, so Core pans; its pan's report moves nothing.
    expect(viewport.offsetTop).toBe(need);
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(viewport.offsetTop).toBe(need);
  });

  // A full-viewport fixed container around a low scroll area. The field's box
  // moves by `shift`, as a document scroll that moves the container moves it.
  function fixedLowScrollArea() {
    const dialog = element(
      'div',
      {top: 0, height: window.innerHeight},
      {position: 'fixed'},
    );
    const {list, input} = lowScrollArea();
    dialog.append(list);
    document.body.append(dialog);
    const page = {shift: 0, scrollY: 0};
    const bottom = window.innerHeight;
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, bottom - 248 - page.shift, 300, 40),
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    return {list, input, page};
  }

  it('reveals through the document a field in a fixed container whose scroller sits under the keyboard, where a document scroll moves the container', () => {
    const {list, input, page} = fixedLowScrollArea();
    // As in Safari while its keyboard shows: the scroll moves the container.
    const scrollBy = vi.fn(({top}: {top: number}) => {
      page.scrollY += top;
      page.shift += top;
    });
    vi.stubGlobal('scrollBy', scrollBy);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const bottom = window.innerHeight;
    expect(list.scrollTop).toBe(0);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({
      top: bottom - 208 + FIELD_OFFSET - (bottom - 300),
      behavior: 'instant',
    });
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('undoes the document scroll where it does not move the fixed container, and pans the visual viewport to the field instead', () => {
    const {input, page} = fixedLowScrollArea();
    // As in Chrome: the scroll moves the page behind, not the container.
    const scrollBy = vi.fn(({top}: {top: number}) => {
      page.scrollY += top;
    });
    vi.stubGlobal('scrollBy', scrollBy);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const bottom = window.innerHeight;
    const need = bottom - 208 + FIELD_OFFSET - (bottom - 300);
    expect(scrollBy.mock.calls).toEqual([
      [{top: need, behavior: 'instant'}],
      [{top: -need, behavior: 'instant'}],
    ]);
    expect(page.scrollY).toBe(0);
    // A pan moves the visual viewport over the container's layout viewport.
    expect(viewport.offsetTop).toBe(need);
    Reflect.deleteProperty(window, 'scrollY');
  });

  // Chrome on Android under `interactive-widget=resizes-content`: the layout
  // viewport, the root's box and the visual viewport shrink together, so the
  // keyboard height reads 0.
  function resizeForKeyboard(cover: number) {
    const height = window.innerHeight - cover;
    vi.stubGlobal('innerHeight', height);
    pageScrollRange(3000);
    viewport.height = height;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
  }

  it("takes no room from Chrome's toolbar coming back, which shrinks the viewport but not the root's box", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    // A field low in the page, focused with no keyboard up, as after the
    // keyboard is dismissed with Back.
    const input = element('input', {top: window.innerHeight - 60, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    // The toolbar comes back: the viewport is 56 px shorter at the same width,
    // and the root keeps its box.
    const height = window.innerHeight - 56;
    vi.stubGlobal('innerHeight', height);
    viewport.height = height;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    runFrames();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('takes no room from a window that gets shorter at the same width with nothing focused, as in Android\u2019s split screen', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: 600, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    expect(getResizedRoom(window).room).toBe(0);
    // Split screen in portrait: the window is 300 px shorter at the same
    // width, and no field has focus.
    resizeForKeyboard(300);
    runFrames();
    expect(getResizedRoom(window).room).toBe(0);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('keeps a field in the page 10 px above the keyboard where the browser shrinks the layout viewport for it, in the report\u2019s own frame', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: 600, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    expect(scrollBy).not.toHaveBeenCalled();
    const keyboardTop = window.innerHeight - 300;
    resizeForKeyboard(300);
    // No frame runs: only what the report's own event does counts.
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({
      top: 640 + FIELD_OFFSET - keyboardTop,
      behavior: 'instant',
    });
  });

  it('scrolls the page back once the browser grows the layout viewport again after the keyboard', () => {
    const page = {scrollY: 0};
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    const input = element('input', {top: 600, height: 40});
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 600 - page.scrollY, 300, 40),
    );
    vi.stubGlobal('scrollBy', ({top}: {top: number}) => {
      page.scrollY += top;
    });
    const scrollTo = vi.fn(({top}: {top: number}) => {
      page.scrollY = top;
    });
    vi.stubGlobal('scrollTo', scrollTo);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    const full = window.innerHeight;
    resizeForKeyboard(300);
    expect(page.scrollY).toBe(640 + FIELD_OFFSET - (full - 300));
    // A later report while the page is still short, as Chrome sends for a
    // scroll, puts nothing back.
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(scrollTo).not.toHaveBeenCalled();
    vi.stubGlobal('innerHeight', full);
    pageScrollRange(3000);
    viewport.height = full;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
    expect(page.scrollY).toBe(0);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('follows the room while the long press that opened a keyboard that resizes the page is held, and waits for a press that starts after the reveal', () => {
    const page = {scrollY: 0};
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    const input = element('input', {top: 600, height: 40});
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 600 - page.scrollY, 300, 40),
    );
    vi.stubGlobal('scrollBy', ({top}: {top: number}) => {
      page.scrollY += top;
    });
    vi.stubGlobal('scrollTo', ({top}: {top: number}) => {
      page.scrollY = top;
    });
    track(keepFieldAboveKeyboard(input));
    // Another surface already watches, so the stream counts the press's
    // finger.
    track(watchRevealPan(window, {owns: () => false}).stop);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    focusOn(input);
    const full = window.innerHeight;
    const revealedAt = (cover: number) => 640 + FIELD_OFFSET - (full - cover);
    // The show's first room reveals, and the room follows while the press
    // that focused the field is still down.
    resizeForKeyboard(300);
    expect(page.scrollY).toBe(revealedAt(300));
    resizeForKeyboard(20);
    expect(page.scrollY).toBe(revealedAt(320));
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    // Room changes during a press that starts after the reveal leave the
    // page to the person.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    resizeForKeyboard(10);
    resizeForKeyboard(10);
    expect(page.scrollY).toBe(revealedAt(320));
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    resizeForKeyboard(10);
    expect(page.scrollY).toBe(revealedAt(350));
    // The keyboard goes during a later press, and the next show's first room
    // reveals again.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    vi.stubGlobal('innerHeight', full);
    pageScrollRange(3000);
    viewport.height = full;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    page.scrollY = 0;
    resizeForKeyboard(300);
    expect(page.scrollY).toBe(revealedAt(300));
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    // The keyboard goes with no finger down. A long press on the field still
    // focused brings it back, and the show's first room reveals with that
    // press still down.
    vi.stubGlobal('innerHeight', full);
    pageScrollRange(3000);
    viewport.height = full;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    page.scrollY = 0;
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    resizeForKeyboard(300);
    expect(page.scrollY).toBe(revealedAt(300));
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    Reflect.deleteProperty(window, 'scrollY');
  });

  // Turns the phone while a keyboard that resizes the page shows. The root's
  // box takes `width` and `height`. A turn re-lays out the page, so its scroll
  // goes to `scrollY`.
  function turnTo(
    width: number,
    height: number,
    page: {scrollY: number},
    scrollY: number,
  ) {
    const root = document.documentElement;
    Object.defineProperty(root, 'clientWidth', {
      configurable: true,
      value: width,
    });
    vi.stubGlobal('innerHeight', height);
    pageScrollRange(3000);
    viewport.height = height;
    page.scrollY = scrollY;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
  }

  it('keeps the room across a turn of the phone and back while the keyboard resizes the page, so the field is 10 px clear again', () => {
    const page = {scrollY: 0};
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    const input = element('input', {top: 600, height: 40});
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 600 - page.scrollY, 300, 40),
    );
    const scrollBy = vi.fn(({top}: {top: number}) => {
      page.scrollY += top;
    });
    vi.stubGlobal('scrollBy', scrollBy);
    vi.stubGlobal('scrollTo', vi.fn());
    try {
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      const full = window.innerHeight;
      resizeForKeyboard(300);
      turnTo(812, 400, page, 0);
      // Back to the first width, the keyboard still up, the page re-laid out.
      turnTo(0, full - 300, page, 0);
      expect(scrollBy).toHaveBeenLastCalledWith({
        top: 640 + FIELD_OFFSET - (full - 300),
        behavior: 'instant',
      });
    } finally {
      Reflect.deleteProperty(document.documentElement, 'clientWidth');
      Reflect.deleteProperty(window, 'scrollY');
    }
  });

  it('puts nothing back at a turn of the phone while the keyboard shows, nor when it closes after', () => {
    const page = {scrollY: 0};
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    const input = element('input', {top: 600, height: 40});
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 600 - page.scrollY, 300, 40),
    );
    vi.stubGlobal('scrollBy', ({top}: {top: number}) => {
      page.scrollY += top;
    });
    const scrollTo = vi.fn(({top}: {top: number}) => {
      page.scrollY = top;
    });
    vi.stubGlobal('scrollTo', scrollTo);
    try {
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      const full = window.innerHeight;
      resizeForKeyboard(300);
      const revealed = 640 + FIELD_OFFSET - (full - 300);
      expect(page.scrollY).toBe(revealed);
      // A turn that keeps the page's scroll and leaves the field in view.
      turnTo(820, 500, page, revealed);
      expect(scrollTo).not.toHaveBeenCalled();
      // The keyboard closes at the new width.
      turnTo(820, 860, page, revealed);
      expect(scrollTo).not.toHaveBeenCalled();
      expect(page.scrollY).toBe(revealed);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'clientWidth');
      Reflect.deleteProperty(window, 'scrollY');
    }
  });

  it('ends the wait for the fold when a keyboard that resizes the page comes back', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    carryRevealAsOffset(page);
    const listeners = countScrollListeners();
    closeKeyboardBeforeFold();
    expect(listeners.added()).toBe(1);
    // The keyboard comes back as a resize of the page and leaves the field
    // clear, so no reveal runs.
    resizeForKeyboard(50);
    expect(listeners.removed()).toBe(listeners.added());
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('keeps a field that mounts after the browser shrank the layout viewport 10 px above the keyboard', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const first = element('input', {top: 100, height: 40});
    document.body.append(first);
    track(keepFieldAboveKeyboard(first));
    focusOn(first);
    const keyboardTop = window.innerHeight - 300;
    resizeForKeyboard(300);
    runFrames();
    expect(scrollBy).not.toHaveBeenCalled();
    // A field that mounts only now, low in the page, takes the focus.
    const later = element('input', {top: 440, height: 40});
    document.body.append(later);
    track(keepFieldAboveKeyboard(later));
    focusOn(later);
    runFrames();
    expect(scrollBy).toHaveBeenNthCalledWith(1, {
      top: 480 + FIELD_OFFSET - keyboardTop,
      behavior: 'instant',
    });
  });

  it('moves no field already 10 px above the keyboard where the browser shrinks the layout viewport for it', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: 100, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    resizeForKeyboard(300);
    runFrames();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('claims a focus move into a field whose scroll area sits under the keyboard, and pans the visual viewport to it', () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const other = element('input', {top: 10, height: 40});
    const {list, input} = lowScrollArea();
    document.body.append(other, list);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    keyboard(300);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    expect(list.scrollTop).toBe(0);
    const bottom = window.innerHeight;
    expect(viewport.offsetTop).toBe(
      bottom - 208 + FIELD_OFFSET - (bottom - 300),
    );
  });

  it("puts back the browser's own pan for a field its scroll area has placed above the keyboard", () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    Object.defineProperty(list, 'scrollHeight', {value: 2000});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    const input = element('input', {top: 600, height: 40});
    list.append(input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(list.scrollTop).toBe(
      640 + FIELD_OFFSET - (window.innerHeight - 300),
    );
    viewport.offsetTop = 160;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it("claims a field near the page's end, since a document scroll reaches into the room the keyboard takes", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    // The page scrolls only 84 px, less than the field needs.
    pageScrollRange(window.innerHeight + 84);
    const input = element('input', {top: window.innerHeight - 50, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(scrollBy).toHaveBeenCalledWith({
      top: 300 - 10 + FIELD_OFFSET,
      behavior: 'instant',
    });
  });

  // A field in the page, whose box moves with the document's scroll. The
  // document scrolls `range` px at most, as Chrome clamps it.
  function pageField(top: number, range: number) {
    const page = {scrollY: 0};
    const input = element('input', {top, height: 40});
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, top - page.scrollY, 300, 40),
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    const scrollBy = vi.fn(({top: by}: {top: number}) => {
      page.scrollY = Math.min(range, Math.max(0, page.scrollY + by));
    });
    vi.stubGlobal('scrollBy', scrollBy);
    const scrollTo = vi.fn(({top}: {top: number}) => {
      page.scrollY = Math.min(range, Math.max(0, top));
    });
    vi.stubGlobal('scrollTo', scrollTo);
    return {input, page, scrollBy, scrollTo};
  }

  it("scrolls the page back to its place before the reveal once the keyboard has gone, on the browser's smooth scroll", () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
      page.scrollY = 40;
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      expect(page.scrollY).toBe(
        fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 300),
      );
      // Outside Safari on iOS, the report that the keyboard has gone comes as
      // it slides down, and the blur moves nothing.
      act(() => input.blur());
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(scrollTo).not.toHaveBeenCalled();
      keyboard(0);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo).toHaveBeenCalledWith({top: 40, behavior: 'smooth'});
      expect(page.scrollY).toBe(40);
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(window, 'scrollY');
    }
  });

  it('scrolls back at once under Reduce Motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('pointer: coarse') || query.includes('reduce'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    pageScrollRange(window.innerHeight * 2);
    const {input, scrollTo} = pageField(
      window.innerHeight - 100,
      window.innerHeight,
    );
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    act(() => input.blur());
    keyboard(0);
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'instant'});
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('scrolls back at once in a theme that reduces motion for everyone', () => {
    document.documentElement.setAttribute('data-astryx-reduced-motion', '');
    try {
      pageScrollRange(window.innerHeight * 2);
      const {input, scrollTo} = pageField(
        window.innerHeight - 100,
        window.innerHeight,
      );
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      act(() => input.blur());
      keyboard(0);
      expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'instant'});
    } finally {
      document.documentElement.removeAttribute('data-astryx-reduced-motion');
      Reflect.deleteProperty(window, 'scrollY');
    }
  });

  it("reveals nothing at a report while a finger is on the screen, as when Firefox's toolbar hides in a drag", () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollBy} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(290);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    // The person drags the page down, so the field sinks under the keyboard,
    // and the toolbar hides twice in the drag.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    page.scrollY -= 40;
    keyboard(256);
    keyboard(226);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    // With the finger up, a report reveals the field again.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    keyboard(290);
    expect(scrollBy).toHaveBeenCalledTimes(2);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('follows a keyboard that grows while the long press that focused the field is held, and holds for a press that starts after the reveal', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, scrollBy} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    // Another surface already watches, as ChatLayout's composer does, so the
    // stream counts the press's finger.
    track(watchRevealPan(window, {owns: () => false}).stop);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    focusOn(input);
    // Gboard can report a short keyboard first, then its full height, while
    // the press that focused the field is still down.
    keyboard(48);
    expect(scrollBy).not.toHaveBeenCalled();
    keyboard(290);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    // The next show's first reveal runs again, the finger still down.
    keyboard(0);
    keyboard(290);
    expect(scrollBy).toHaveBeenCalledTimes(2);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    // A press that starts after the reveal holds a report until it lifts.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    keyboard(320);
    expect(scrollBy).toHaveBeenCalledTimes(2);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    keyboard(330);
    expect(scrollBy).toHaveBeenCalledTimes(3);
    // The keyboard goes with no finger down, as after Back. A long press on
    // the field still focused brings it back, and the show's first reveal
    // runs with that press still down.
    keyboard(0);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    keyboard(290);
    expect(scrollBy).toHaveBeenCalledTimes(4);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('keeps a scroll the person made while the keyboard showed, and puts nothing back', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    page.scrollY += 30;
    const scrolled = page.scrollY;
    act(() => input.blur());
    keyboard(0);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(page.scrollY).toBe(scrolled);
    Reflect.deleteProperty(window, 'scrollY');
  });

  // Firefox for Android carries the reveal's document scroll as a visual-
  // viewport offset. At a slow speed it turns that offset back into a document
  // scroll only after the keyboard's hide report.
  function carryRevealAsOffset(page: {scrollY: number}) {
    viewport.offsetTop = page.scrollY;
    page.scrollY = 0;
  }

  function closeKeyboardBeforeFold() {
    viewport.offsetTop = 0;
    keyboard(0);
  }

  // The document's own scroll event, which the browser fires at the document.
  function foldReveal(page: {scrollY: number}, to: number) {
    page.scrollY = to;
    act(() => {
      document.dispatchEvent(new Event('scroll', {bubbles: true}));
    });
  }

  it('scrolls the page back after Firefox turns the reveal back into a document scroll after the hide report', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const revealed = page.scrollY;
    expect(revealed).toBeGreaterThan(0);
    carryRevealAsOffset(page);
    closeKeyboardBeforeFold();
    expect(scrollTo).not.toHaveBeenCalled();
    // A scroll area's own scroll is not the document's.
    const list = element('div', {top: 0, height: 100}, {overflowY: 'auto'});
    document.body.append(list);
    act(() => {
      list.dispatchEvent(new Event('scroll'));
    });
    foldReveal(page, revealed);
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
    expect(page.scrollY).toBe(0);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('keeps the page where a touch left it while Firefox carried the reveal as an offset', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const revealed = page.scrollY;
    carryRevealAsOffset(page);
    // The person drags the page: Firefox moves only the offset.
    act(() => {
      document.body.dispatchEvent(new Event('touchstart', {bubbles: true}));
    });
    viewport.offsetTop += 156;
    closeKeyboardBeforeFold();
    act(() => {
      document.body.dispatchEvent(new Event('touchstart', {bubbles: true}));
    });
    foldReveal(page, revealed + 156);
    foldReveal(page, revealed);
    expect(scrollTo).not.toHaveBeenCalled();
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('waits for only the first document scroll after the hide report, and only a short while', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const revealed = page.scrollY;
    carryRevealAsOffset(page);
    closeKeyboardBeforeFold();
    // A first scroll that lands elsewhere ends the wait.
    foldReveal(page, revealed - 40);
    foldReveal(page, revealed);
    expect(scrollTo).not.toHaveBeenCalled();
    // Again, with no scroll until the wait is over.
    focusOn(input);
    page.scrollY = 0;
    keyboard(300);
    const again = page.scrollY;
    carryRevealAsOffset(page);
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      closeKeyboardBeforeFold();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
    } finally {
      vi.useRealTimers();
    }
    foldReveal(page, again);
    expect(scrollTo).not.toHaveBeenCalled();
    Reflect.deleteProperty(window, 'scrollY');
  });

  // How many native scroll listeners the window gained and lost from here on.
  function countScrollListeners() {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const count = (calls: ReadonlyArray<ReadonlyArray<unknown>>) =>
      calls.filter(([type]) => type === 'scroll').length;
    return {
      added: () => count(added.mock.calls),
      removed: () => count(removed.mock.calls),
    };
  }

  it.each([
    ['the fold', 'fold'],
    ['a touch', 'touch'],
    ['the keyboard coming back', 'keyboard'],
    ['the wait running out', 'time'],
    ["the field's page going", 'gone'],
  ] as const)(
    'leaves no listener behind once the wait for the fold ends with %s',
    (_name, ending) => {
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, page} = pageField(fieldTop, window.innerHeight);
      const stop = track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      const revealed = page.scrollY;
      carryRevealAsOffset(page);
      const listeners = countScrollListeners();
      vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
      try {
        closeKeyboardBeforeFold();
        expect(listeners.added()).toBe(1);
        expect(listeners.removed()).toBe(0);
        if (ending === 'fold') {
          foldReveal(page, revealed);
        } else if (ending === 'touch') {
          act(() => {
            document.body.dispatchEvent(
              new Event('touchstart', {bubbles: true}),
            );
          });
        } else if (ending === 'keyboard') {
          // A keyboard that leaves the field clear, so no reveal runs.
          keyboard(50);
        } else if (ending === 'time') {
          act(() => {
            vi.advanceTimersByTime(1000);
          });
        } else {
          stop();
        }
      } finally {
        vi.useRealTimers();
      }
      expect(listeners.removed()).toBe(listeners.added());
      Reflect.deleteProperty(window, 'scrollY');
    },
  );

  it('decides at the hide report in Chrome, with no wait, where the page sits where Core or the person left it', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    const listeners = countScrollListeners();
    focusOn(input);
    keyboard(300);
    act(() => input.blur());
    keyboard(0);
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
    focusOn(input);
    keyboard(300);
    page.scrollY += 75;
    act(() => input.blur());
    keyboard(0);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(listeners.added()).toBe(0);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it("scrolls a scroll area at once through its own scrollBy, which the area's smooth scroll-behavior cannot slow", () => {
    const list = element(
      'div',
      {top: 100, height: window.innerHeight - 100},
      {overflowY: 'auto', scrollBehavior: 'smooth'},
    );
    let listTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => listTop,
      set: (value: number) => {
        listTop = Math.max(0, Math.min(600, value));
      },
    });
    const listScrollBy = vi.fn(({top}: {top: number}) => {
      list.scrollTop = listTop + top;
    });
    Object.defineProperty(list, 'scrollBy', {value: listScrollBy});
    Object.defineProperty(list, 'scrollHeight', {
      value: 600 + window.innerHeight - 100,
    });
    Object.defineProperty(list, 'clientHeight', {
      value: window.innerHeight - 100,
    });
    const input = element('input', {top: window.innerHeight - 60, height: 40});
    list.append(input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const revealed =
      window.innerHeight - 20 + FIELD_OFFSET - (window.innerHeight - 300);
    expect(listScrollBy).toHaveBeenCalledWith({
      top: revealed,
      behavior: 'instant',
    });
    expect(listTop).toBe(revealed);
  });

  it('scrolls a scroll area back when the keyboard goes with the field still focused, as Back does in Chrome', () => {
    const list = element(
      'div',
      {top: 100, height: window.innerHeight - 100},
      {overflowY: 'auto'},
    );
    let listTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => listTop,
      set: (value: number) => {
        listTop = Math.max(0, Math.min(600, value));
      },
    });
    const scrollTo = vi.fn(({top}: {top: number}) => {
      list.scrollTop = top;
    });
    Object.defineProperty(list, 'scrollTo', {value: scrollTo});
    Object.defineProperty(list, 'scrollHeight', {
      value: 600 + window.innerHeight - 100,
    });
    Object.defineProperty(list, 'clientHeight', {
      value: window.innerHeight - 100,
    });
    const input = element('input', {top: window.innerHeight - 60, height: 40});
    list.append(input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(listTop).toBe(
      window.innerHeight - 20 + FIELD_OFFSET - (window.innerHeight - 300),
    );
    keyboard(0);
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
    expect(listTop).toBe(0);
  });

  it('keeps the scroll where focus moves to another field, so the keyboard stays up', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
    const other = element('input', {top: 20, height: 40});
    document.body.append(other);
    track(keepFieldAboveKeyboard(input));
    track(keepFieldAboveKeyboard(other));
    focusOn(input);
    keyboard(300);
    const revealed = page.scrollY;
    expect(revealed).toBeGreaterThan(0);
    focusOn(other);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(page.scrollY).toBe(revealed);
    Reflect.deleteProperty(window, 'scrollY');
  });

  describe("on iOS, where a field rises on the browser's smooth scroll", () => {
    beforeEach(() => {
      // Safari's CSS.supports, in both forms: a property and value, or a
      // condition.
      vi.stubGlobal('CSS', {
        supports: (property: string, value?: string) =>
          value === undefined
            ? property === '(-webkit-touch-callout: none)'
            : property === '-webkit-touch-callout' && value === 'none',
      });
    });

    it("rises on the browser's smooth scroll when the keyboard opens", () => {
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, scrollBy} = pageField(fieldTop, window.innerHeight);
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      expect(scrollBy).toHaveBeenCalledTimes(1);
      expect(scrollBy).toHaveBeenCalledWith({
        top: fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 300),
        behavior: 'smooth',
      });
      Reflect.deleteProperty(window, 'scrollY');
    });

    it('moves the field at once under Reduce Motion', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches:
            query.includes('pointer: coarse') || query.includes('reduce'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, scrollBy} = pageField(fieldTop, window.innerHeight);
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      expect(scrollBy).toHaveBeenCalledWith({
        top: fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 300),
        behavior: 'instant',
      });
      Reflect.deleteProperty(window, 'scrollY');
    });

    it('moves the field at once in a theme that reduces motion for everyone', () => {
      document.documentElement.setAttribute('data-astryx-reduced-motion', '');
      try {
        pageScrollRange(window.innerHeight * 2);
        const fieldTop = window.innerHeight - 100;
        const {input, scrollBy} = pageField(fieldTop, window.innerHeight);
        track(keepFieldAboveKeyboard(input));
        focusOn(input);
        keyboard(300);
        expect(scrollBy).toHaveBeenCalledWith({
          top: fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 300),
          behavior: 'instant',
        });
      } finally {
        document.documentElement.removeAttribute('data-astryx-reduced-motion');
        Reflect.deleteProperty(window, 'scrollY');
      }
    });

    it("decides at the hide report as before, with no wait: Safari's own scroll at the focus, the rise, then Done, and again after a drag", () => {
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, page, scrollTo} = pageField(fieldTop, window.innerHeight);
      track(keepFieldAboveKeyboard(input));
      const listeners = countScrollListeners();
      focusOn(input);
      // Safari scrolls the page by 7 px at the focus, before the reveal.
      page.scrollY = 7;
      keyboard(300);
      act(() => input.blur());
      keyboard(0);
      expect(scrollTo).toHaveBeenCalledWith({top: 7, behavior: 'smooth'});
      focusOn(input);
      page.scrollY = 7;
      keyboard(300);
      act(() => {
        document.body.dispatchEvent(new Event('touchstart', {bubbles: true}));
      });
      page.scrollY += 87;
      act(() => input.blur());
      keyboard(0);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(listeners.added()).toBe(0);
      Reflect.deleteProperty(window, 'scrollY');
    });

    it('scrolls back to its place after a rise the browser drew later', () => {
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, page, scrollBy, scrollTo} = pageField(
        fieldTop,
        window.innerHeight,
      );
      // The browser draws the rise over the next frames, not in the call.
      scrollBy.mockImplementation(() => {});
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      page.scrollY = fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 300);
      act(() => input.blur());
      keyboard(0);
      expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
      Reflect.deleteProperty(window, 'scrollY');
    });

    it('carries its rise on when the keyboard grows before the rise is drawn, and still scrolls back', () => {
      pageScrollRange(window.innerHeight * 2);
      const fieldTop = window.innerHeight - 100;
      const {input, page, scrollBy, scrollTo} = pageField(
        fieldTop,
        window.innerHeight,
      );
      scrollBy.mockImplementation(() => {});
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      keyboard(340);
      expect(scrollBy).toHaveBeenLastCalledWith({
        top: fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 340),
        behavior: 'smooth',
      });
      page.scrollY = fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 340);
      act(() => input.blur());
      keyboard(0);
      expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'smooth'});
      Reflect.deleteProperty(window, 'scrollY');
    });

    it('takes no second reveal for a field its scroll area raises, before the rise is drawn', () => {
      const pageScrollBy = vi.fn();
      vi.stubGlobal('scrollBy', pageScrollBy);
      const list = element(
        'div',
        {top: 100, height: window.innerHeight - 100},
        {overflowY: 'auto'},
      );
      let listTop = 0;
      Object.defineProperty(list, 'scrollTop', {
        configurable: true,
        get: () => listTop,
        set: (value: number) => {
          listTop = Math.max(0, Math.min(600, value));
        },
      });
      const listScrollBy = vi.fn();
      Object.defineProperty(list, 'scrollBy', {value: listScrollBy});
      Object.defineProperty(list, 'scrollHeight', {
        value: 600 + window.innerHeight - 100,
      });
      Object.defineProperty(list, 'clientHeight', {
        value: window.innerHeight - 100,
      });
      const input = element('input', {
        top: window.innerHeight - 60,
        height: 40,
      });
      list.append(input);
      document.body.append(list);
      track(keepFieldAboveKeyboard(input));
      focusOn(input);
      keyboard(300);
      expect(listScrollBy).toHaveBeenCalledWith({
        top:
          window.innerHeight - 20 + FIELD_OFFSET - (window.innerHeight - 300),
        behavior: 'smooth',
      });
      expect(pageScrollBy).not.toHaveBeenCalled();
    });

    describe('at the blur that closes the keyboard, before the report that it has gone', () => {
      beforeEach(() => {
        vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
      });

      afterEach(() => {
        vi.useRealTimers();
        Reflect.deleteProperty(window, 'scrollY');
      });

      /** A field in the page, raised over a 300 px keyboard from scroll 40. */
      function raisedField() {
        pageScrollRange(window.innerHeight * 2);
        const fieldTop = window.innerHeight - 100;
        const parts = pageField(fieldTop, window.innerHeight);
        parts.page.scrollY = 40;
        track(keepFieldAboveKeyboard(parts.input));
        focusOn(parts.input);
        keyboard(300);
        return parts;
      }

      /** Ends the blur's focus change: focus lands after the event. */
      function settle() {
        act(() => {
          vi.advanceTimersByTime(0);
        });
      }

      it('scrolls the page back at once, beside the slide, and the report moves nothing more', () => {
        const {input, page, scrollTo} = raisedField();
        act(() => input.blur());
        settle();
        expect(scrollTo).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({top: 40, behavior: 'smooth'});
        expect(page.scrollY).toBe(40);
        keyboard(0);
        expect(scrollTo).toHaveBeenCalledTimes(1);
      });

      it('keeps the page when focus moves on to another field, and the keyboard stays', () => {
        const {input, scrollTo} = raisedField();
        const next = element('input', {top: 200, height: 40});
        document.body.append(next);
        act(() => next.focus());
        settle();
        expect(document.activeElement).toBe(next);
        expect(scrollTo).not.toHaveBeenCalled();
        input.remove();
      });

      it('waits for the report while a finger is on the screen at the blur, as when the field is tapped again at once', () => {
        const {input, scrollTo} = raisedField();
        act(() => {
          document.body.dispatchEvent(touchEvent('touchstart', 1));
        });
        act(() => input.blur());
        settle();
        expect(scrollTo).not.toHaveBeenCalled();
        act(() => {
          document.body.dispatchEvent(touchEvent('touchend', 0));
        });
        keyboard(0);
        expect(scrollTo).toHaveBeenCalledWith({top: 40, behavior: 'smooth'});
      });

      it('keeps the page when focus moves into a frame, whose field keeps the keyboard up', () => {
        const {scrollTo} = raisedField();
        const frame = document.createElement('iframe');
        document.body.append(frame);
        act(() => frame.focus());
        settle();
        expect(document.activeElement).toBe(frame);
        expect(scrollTo).not.toHaveBeenCalled();
        frame.remove();
      });

      it('leaves a page the person scrolled while the keyboard showed', () => {
        const {input, page, scrollTo} = raisedField();
        page.scrollY += 87;
        act(() => input.blur());
        settle();
        keyboard(0);
        expect(scrollTo).not.toHaveBeenCalled();
      });

      it('waits for the report under Reduce Motion, then lands at once', () => {
        vi.stubGlobal(
          'matchMedia',
          vi.fn((query: string) => ({
            matches:
              query.includes('pointer: coarse') || query.includes('reduce'),
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        );
        const {input, scrollTo} = raisedField();
        act(() => input.blur());
        settle();
        expect(scrollTo).not.toHaveBeenCalled();
        keyboard(0);
        expect(scrollTo).toHaveBeenCalledWith({top: 40, behavior: 'instant'});
      });

      it('stops the scroll back where the page is when the field gains focus again during the slide, raises it from there in one scroll, and the next close goes back to the first place', () => {
        const {input, page, scrollBy, scrollTo} = raisedField();
        const raised = page.scrollY;
        // The browser draws the scroll back over the next frames.
        scrollTo.mockImplementation(() => {});
        act(() => input.blur());
        settle();
        expect(scrollTo).toHaveBeenCalledWith({top: 40, behavior: 'smooth'});
        page.scrollY = raised - 60;
        scrollBy.mockClear();
        // A tap focuses the field again before Safari reports the keyboard gone.
        focusOn(input);
        expect(scrollTo).toHaveBeenLastCalledWith({
          top: raised - 60,
          behavior: 'instant',
        });
        expect(scrollBy).toHaveBeenCalledTimes(1);
        expect(scrollBy).toHaveBeenCalledWith({top: 60, behavior: 'smooth'});
        expect(page.scrollY).toBe(raised);
        act(() => input.blur());
        settle();
        expect(scrollTo).toHaveBeenCalledTimes(3);
        expect(scrollTo).toHaveBeenLastCalledWith({
          top: 40,
          behavior: 'smooth',
        });
      });

      it('keeps the page where a touch stopped the scroll back, when the field gains focus again with nothing left to raise, and the next close still goes back', () => {
        const {input, page, scrollBy, scrollTo} = raisedField();
        const raised = page.scrollY;
        // The tap's touch stops the browser's scroll back before it moves.
        scrollTo.mockImplementation(() => {});
        act(() => input.blur());
        settle();
        scrollBy.mockClear();
        focusOn(input);
        expect(scrollBy).not.toHaveBeenCalled();
        expect(page.scrollY).toBe(raised);
        act(() => input.blur());
        settle();
        expect(scrollTo).toHaveBeenLastCalledWith({
          top: 40,
          behavior: 'smooth',
        });
      });

      it('scrolls back at the report once more after such a focus, when the keyboard then goes with the field still focused', () => {
        const {input, page, scrollTo} = raisedField();
        const raised = page.scrollY;
        scrollTo.mockImplementation(() => {});
        act(() => input.blur());
        settle();
        page.scrollY = raised - 60;
        focusOn(input);
        expect(page.scrollY).toBe(raised);
        keyboard(0);
        expect(scrollTo).toHaveBeenCalledTimes(3);
        expect(scrollTo).toHaveBeenLastCalledWith({
          top: 40,
          behavior: 'smooth',
        });
      });
    });
  });

  it("pans the visual viewport for the rest where the document reaches its end, so a field at a short page's end ends 10 px above the keyboard", () => {
    pageScrollRange(window.innerHeight + 84);
    const fieldTop = window.innerHeight - 50;
    const {input, page, scrollBy} = pageField(fieldTop, 84);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    const keyboardTop = window.innerHeight - 300;
    const need = fieldTop + 40 + FIELD_OFFSET - keyboardTop;
    expect(scrollBy).toHaveBeenCalledWith({top: need, behavior: 'instant'});
    expect(page.scrollY).toBe(84);
    // The pan takes the rest at once, so Chrome's own pan finds the field clear.
    expect(viewport.offsetTop).toBe(need - 84);
    expect(input.getBoundingClientRect().bottom - viewport.offsetTop).toBe(
      keyboardTop - FIELD_OFFSET,
    );
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('pans nothing where the document scroll reaches the room the keyboard takes, as in Safari', () => {
    pageScrollRange(window.innerHeight + 84);
    const fieldTop = window.innerHeight - 50;
    // As in Safari while its keyboard shows: the scroll goes past the range.
    const {input, page} = pageField(fieldTop, Number.POSITIVE_INFINITY);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(page.scrollY).toBe(
      fieldTop + 40 + FIELD_OFFSET - (window.innerHeight - 300),
    );
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(viewport.offsetTop).toBe(0);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('keeps its own pan when the browser applies it after the call', () => {
    const {list, input} = lowScrollArea();
    document.body.append(list);
    vi.stubGlobal('scrollBy', vi.fn());
    const pans: number[] = [];
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(function (this: HTMLElement) {
        pans.push(parseFloat(this.style.top) || 0);
      }),
    });
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(pans).toHaveLength(1);
    // The pan lands a frame later, with a report of its own; it stays.
    viewport.offsetTop = pans[0] ?? 0;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(pans).toHaveLength(1);
  });

  it('moves its docked bar up by the part of it the keyboard covers, and back once the keyboard has gone', () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    // The bar's bottom edge ends at the keyboard's top: the part of the bar
    // the keyboard covered, and no more.
    expect(animatorFor(bar).get('y')).toBe(-300);
    // Leaving the field for nothing while the keyboard still shows moves
    // nothing until the keyboard goes.
    act(() => input.blur());
    expect(animatorFor(bar).get('y')).toBe(-300);
    keyboard(0);
    expect(animatorFor(bar).get('y')).toBe(0);
    // At rest the ridden bar carries no translate of its own.
    expect(['', 'none']).toContain(bar.style.translate);
  });

  it("keeps the bar up when focus moves to another field in it, even as the first field's path detaches", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const first = element('input', {top: bottom - 50, height: 40});
    const second = element('input', {top: bottom - 50, height: 40});
    bar.append(first, second);
    document.body.append(bar);
    const stopFirst = keepFieldAboveKeyboard(first);
    track(keepFieldAboveKeyboard(second));
    focusOn(first);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(-300);
    focusOn(second);
    expect(animatorFor(bar).get('y')).toBe(-300);
    stopFirst();
    expect(animatorFor(bar).get('y')).toBe(-300);
  });

  it('reveals a field in a container that fills the viewport through its scroller there, and never moves the container', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const dialog = element(
      'div',
      {top: 0, height: window.innerHeight},
      {position: 'fixed'},
    );
    const body = element(
      'div',
      {top: 0, height: window.innerHeight},
      {overflowY: 'auto'},
    );
    Object.defineProperty(body, 'scrollHeight', {value: 1600});
    Object.defineProperty(body, 'clientHeight', {value: window.innerHeight});
    let bodyTop = 0;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => bodyTop,
      set: (value: number) => {
        bodyTop = Math.max(0, Math.min(1600 - window.innerHeight, value));
      },
    });
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: 640, height: 40});
    body.append(other, input);
    dialog.append(body);
    document.body.append(dialog);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    // The focus move is claimed: the dialog's own scroller reveals the field.
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    const keyboardTop = window.innerHeight - 300;
    expect(body.scrollTop).toBe(640 + 40 - (keyboardTop - FIELD_OFFSET));
    expect(scrollBy).not.toHaveBeenCalled();
    expect(animatorFor(dialog).get('y')).toBe(0);
  });

  it("leaves a field in a container that fills the viewport with no scroller around it to the browser's own reveal", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const dialog = element(
      'div',
      {top: 0, height: window.innerHeight},
      {position: 'fixed'},
    );
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: 640, height: 40});
    dialog.append(other, input);
    document.body.append(dialog);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    // The focus move is not claimed: the browser's own focus step runs.
    expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(dialog.style.translate).toBe('');
  });

  it('lifts a docked container taller than the room above the keyboard with no scroller only as far as its focused field needs', () => {
    const bottom = window.innerHeight;
    // A full-height drawer below a 56 px header, with no scroller of its own.
    const drawer = element(
      'div',
      {top: 56, height: bottom - 56},
      {position: 'fixed'},
    );
    const top = element('input', {top: 80, height: 40});
    const low = element('input', {top: bottom - 68, height: 40});
    drawer.append(top, low);
    document.body.append(drawer);
    track(keepFieldAboveKeyboard(top));
    track(keepFieldAboveKeyboard(low));
    // A field near its top already clears the keyboard: nothing moves, so
    // the field stays on screen.
    focusOn(top);
    keyboard(300);
    expect(drawer.style.translate).toBe('');
    // A field near its bottom moves up only to sit `FIELD_OFFSET` above the
    // keyboard, less than the drawer's own 300 px overlap.
    focusOn(low);
    runFrames();
    const keyboardTop = bottom - 300;
    expect(animatorFor(drawer).get('y')).toBe(
      -(bottom - 28 + FIELD_OFFSET - keyboardTop),
    );
  });

  it('keeps the guards for a too-tall container with no scroller: an app moving it, or a text field outside with focus, gets no lift', () => {
    const bottom = window.innerHeight;
    const drawer = element(
      'div',
      {top: 56, height: bottom - 56},
      {position: 'fixed'},
    );
    const header = element('input', {top: 8, height: 40});
    const low = element('input', {top: bottom - 68, height: 40});
    drawer.append(low);
    document.body.append(header, drawer);
    let running: unknown[] = [
      {playState: 'running', transitionProperty: 'transform'},
    ];
    Object.defineProperty(drawer, 'getAnimations', {
      configurable: true,
      value: () => running,
    });
    track(keepFieldAboveKeyboard(low));
    focusOn(low);
    keyboard(300);
    // The app is moving the drawer itself.
    expect(drawer.style.translate).toBe('');
    running = [];
    keyboard(300);
    expect(animatorFor(drawer).get('y')).toBe(
      -(bottom - 28 + FIELD_OFFSET - (bottom - 300)),
    );
    // A text field outside the drawer takes focus: the drawer rests, so it
    // never covers that field.
    focusOn(header);
    expect(animatorFor(drawer).get('y')).toBe(0);
  });

  it('keeps a docked container taller than the room above the keyboard in place, and reveals its field through its scroller there', () => {
    const bottom = window.innerHeight;
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    // A full-height drawer below a 56 px header, docked to the bottom edge.
    const drawer = element(
      'div',
      {top: 56, height: bottom - 56},
      {position: 'fixed'},
    );
    const list = element(
      'div',
      {top: 56, height: bottom - 56},
      {overflowY: 'auto'},
    );
    Object.defineProperty(list, 'scrollHeight', {value: 1400});
    Object.defineProperty(list, 'clientHeight', {value: bottom - 56});
    let listTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => listTop,
      set: (value: number) => {
        listTop = Math.max(0, Math.min(1400 - (bottom - 56), value));
      },
    });
    const input = element('input', {top: bottom - 68, height: 40});
    list.append(input);
    drawer.append(list);
    document.body.append(drawer);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(drawer.style.translate).toBe('');
    const keyboardTop = bottom - 300;
    expect(list.scrollTop).toBe(bottom - 28 - (keyboardTop - FIELD_OFFSET));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('reads every box before it moves a container that turns too tall, and reveals its field from where the move leaves it', () => {
    const bottom = window.innerHeight;
    vi.stubGlobal('scrollBy', vi.fn());
    // A full-height drawer below a 56 px header, docked to the bottom edge.
    const drawer = element(
      'div',
      {top: 56, height: bottom - 56},
      {position: 'fixed'},
    );
    const list = element(
      'div',
      {top: 56, height: bottom - 56},
      {overflowY: 'auto'},
    );
    Object.defineProperty(list, 'scrollHeight', {value: 1400});
    Object.defineProperty(list, 'clientHeight', {value: bottom - 56});
    // Each layout read records the drawer's translate at that moment.
    const reads: string[] = [];
    let listTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => {
        reads.push(drawer.style.translate);
        return listTop;
      },
      set: (value: number) => {
        listTop = Math.max(0, Math.min(1400 - (bottom - 56), value));
      },
    });
    const input = element('input', {top: bottom - 68, height: 40});
    list.append(input);
    drawer.append(list);
    document.body.append(drawer);
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(
      function (this: Element) {
        if (this === input || this === list) {
          reads.push(drawer.style.translate);
        }
        return boxOf(this);
      },
    );
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    // A short keyboard lifts the drawer by the part of it the keyboard covers.
    keyboard(40);
    const lifted = drawer.style.translate;
    expect(animatorFor(drawer).get('y')).toBeLessThan(0);
    // A tall keyboard leaves the drawer too tall. It goes back to rest, and
    // its scroller reveals the field. Every read comes before that move.
    reads.length = 0;
    keyboard(300);
    expect(drawer.style.translate).toBe('');
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter(translate => translate !== lifted)).toEqual([]);
    const keyboardTop = bottom - 300;
    expect(listTop).toBe(bottom - 28 - (keyboardTop - FIELD_OFFSET));
  });

  it("leaves a field on a page with nothing to scroll to the browser's own reveal", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    // A page no taller than the viewport.
    pageScrollRange(window.innerHeight);
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: window.innerHeight - 60, height: 40});
    document.body.append(other, input);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    // The focus move is not claimed: the browser's own focus step runs.
    expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('scrolls a field above the view down into it when it gains focus', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: -200, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    expect(scrollBy).toHaveBeenCalledWith({top: -200, behavior: 'instant'});
  });

  it('scrolls a field below the view into it with no keyboard up, as a hardware Tab reaches it', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: window.innerHeight + 100, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    expect(scrollBy).toHaveBeenCalledWith({top: 140, behavior: 'instant'});
  });

  it("raises the tap's click once after a claimed tap, so a listener on the field or an ancestor still runs", () => {
    const wrapper = element('div', null);
    const input = element('input', {top: 660, height: 40});
    wrapper.append(input);
    document.body.append(wrapper);
    const onField = vi.fn();
    const onAncestor = vi.fn();
    input.addEventListener('click', onField);
    wrapper.addEventListener('click', onAncestor);
    track(keepFieldAboveKeyboard(input));
    const touch = (type: string) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const point = {
        identifier: 0,
        clientX: 40,
        clientY: 680,
        screenX: 41,
        screenY: 742,
      };
      Object.assign(event, {
        touches: type === 'touchend' ? [] : [point],
        changedTouches: [point],
      });
      return event;
    };
    act(() => {
      input.dispatchEvent(touch('touchstart'));
    });
    act(() => {
      input.dispatchEvent(touch('touchend'));
    });
    expect(document.activeElement).toBe(input);
    expect(onField).toHaveBeenCalledTimes(1);
    expect(onAncestor).toHaveBeenCalledTimes(1);
    const click = onField.mock.calls[0][0] as PointerEvent;
    expect(click.isTrusted).toBe(false);
    expect(click.pointerType).toBe('touch');
    expect([
      click.clientX,
      click.clientY,
      click.screenX,
      click.screenY,
      click.detail,
    ]).toEqual([40, 680, 41, 742, 1]);
  });

  it("leaves a document scroll the app makes while a docked bar's field has focus, which Safari carries out as a visual-viewport offset", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    const page = {scrollY: 100};
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => page.scrollY,
    });
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    // The app scrolls past the page's end; Safari carries the rest as an offset.
    page.scrollY = 400;
    viewport.offsetTop = 120;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(viewport.offsetTop).toBe(120);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('puts back a pan the browser makes on its own after a focus no claim saw', () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const input = element('input', {top: 300, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    // A script focuses the field while nothing has focus: no blur, no tap.
    focusOn(input);
    keyboard(300);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // The browser pans the visual viewport down to the field by itself.
    viewport.offsetTop = 120;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it("keeps a drag's pan while the finger is down, when Firefox's toolbar hiding resizes the viewport in the drag", () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const input = element('input', {top: 300, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(290);
    // The person drags the page with the keyboard up; the finger stays down.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    viewport.offsetTop = 162;
    // Firefox's toolbar hides in the drag: the viewport grows twice, so the
    // keyboard reads shorter, while the drag moves the offset on.
    viewport.height = window.innerHeight - 256;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    viewport.offsetTop = 165;
    viewport.height = window.innerHeight - 226;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(viewport.offsetTop).toBe(165);
    // Once the finger is up, a pan the browser makes after a report is put
    // back again.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    keyboard(290);
    viewport.offsetTop += 40;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('holds a report while an older finger is down after a newer touch came and went', () => {
    pageScrollRange(window.innerHeight * 2);
    const fieldTop = window.innerHeight - 100;
    const {input, scrollBy} = pageField(fieldTop, window.innerHeight);
    track(keepFieldAboveKeyboard(input));
    track(watchRevealPan(window, {owns: () => false}).stop);
    // A long press focuses the field and stays down.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    focusOn(input);
    keyboard(290);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    // A second finger taps and lifts while the first stays down.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 2));
    });
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 1));
    });
    keyboard(320);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    act(() => {
      document.body.dispatchEvent(touchEvent('touchend', 0));
    });
    keyboard(330);
    expect(scrollBy).toHaveBeenCalledTimes(2);
    Reflect.deleteProperty(window, 'scrollY');
  });

  it('forgets a finger whose lift it never heard once the keyboard hides, so the next show puts back the browser pan', () => {
    vi.stubGlobal('scrollBy', vi.fn());
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const input = element('input', {top: 300, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(290);
    // A touch whose target leaves the page: its end never reaches the window.
    act(() => {
      document.body.dispatchEvent(touchEvent('touchstart', 1));
    });
    keyboard(0);
    keyboard(290);
    viewport.offsetTop += 40;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('moves nothing inside a keyboard target, which keeps its own fields clear', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const sheet = element('div', {top: 300, height: 468});
    const input = element('input', {top: 700, height: 40});
    sheet.append(input);
    document.body.append(sheet);
    track(registerKeyboardTarget(sheet));
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(animatorFor(sheet).get('y')).toBe(0);
  });

  it('takes a focus move into the field without the browser reveal', () => {
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: 660, height: 40});
    document.body.append(other, input);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    expect(document.activeElement).toBe(input);
  });

  it("takes a first tap on the field itself, so the browser's tap focus cannot pan the page", () => {
    const input = element('input', {top: 660, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    const focus = vi.spyOn(input, 'focus');
    const touch = (type: string) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const points =
        type === 'touchend' ? [] : [{identifier: 0, clientX: 40, clientY: 680}];
      Object.assign(event, {
        touches: points,
        changedTouches: [{identifier: 0, clientX: 40, clientY: 680}],
      });
      return event;
    };
    act(() => {
      input.dispatchEvent(touch('touchstart'));
    });
    const end = touch('touchend');
    act(() => {
      input.dispatchEvent(end);
    });
    expect(end.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    expect(document.activeElement).toBe(input);
  });

  it('attaches nothing under a mouse or a trackpad', () => {
    isCoarse = false;
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const input = element('input', {top: 660, height: 40});
    document.body.append(input);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe('followKeyboard', () => {
  it("rides a Core host's own docked element, sticky or fixed, and registers it, so the field's own path stands down", () => {
    const bottom = window.innerHeight;
    const dock = element(
      'div',
      {top: bottom - 80, height: 80},
      {position: 'sticky'},
    );
    const input = element('textarea', {top: bottom - 64, height: 48});
    dock.append(input);
    document.body.append(dock);
    track(followKeyboard(dock, {move: 'ride', offset: 8}));
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(320);
    // The dock's bottom edge reaches the keyboard's top; the field already
    // keeps 8 px above it.
    expect(animatorFor(dock).get('y')).toBe(-320);
  });

  it("moves nothing on an app's elements but the focused field's fixed ancestor docked at the viewport's bottom", () => {
    const bottom = window.innerHeight;
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    // An app's sticky bar is no fixed container: it never moves.
    const sticky = element(
      'div',
      {top: bottom - 80, height: 80},
      {position: 'sticky'},
    );
    const inSticky = element('textarea', {top: bottom - 64, height: 48});
    sticky.append(inSticky);
    // An app's fixed bar floating above the bottom edge is not docked.
    const floating = element(
      'div',
      {top: bottom - 140, height: 60},
      {position: 'fixed'},
    );
    const inFloating = element('input', {top: bottom - 130, height: 40});
    floating.append(inFloating);
    // The docked bar moves, and only it: not its page wrapper.
    const wrapper = element('div', null);
    const docked = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const inDocked = element('input', {top: bottom - 50, height: 40});
    docked.append(inDocked);
    wrapper.append(docked);
    document.body.append(sticky, floating, wrapper);
    for (const field of [inSticky, inFloating, inDocked]) {
      track(keepFieldAboveKeyboard(field));
    }
    focusOn(inSticky);
    keyboard(300);
    focusOn(inFloating);
    focusOn(inDocked);
    expect(animatorFor(docked).get('y')).toBeLessThan(0);
    const moved = [...document.querySelectorAll<HTMLElement>('*')].filter(
      node => node.style.translate !== '' && node.style.translate !== 'none',
    );
    expect(moved).toEqual([docked]);
  });

  it("sets an app's raised bar to rest once it leaves the bottom edge, even after focus left for nothing", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    act(() => input.blur());
    expect(animatorFor(bar).get('y')).toBeLessThan(0);
    bar.setAttribute('data-top', String(bottom - 200));
    input.setAttribute('data-top', String(bottom - 190));
    keyboard(200);
    expect(animatorFor(bar).get('y')).toBe(0);
  });

  it("stops moving an app's bar the moment it is no longer docked at the viewport's bottom", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBeLessThan(0);
    // The app moves its bar up the page: it no longer sits on the bottom edge.
    bar.setAttribute('data-top', String(bottom - 200));
    input.setAttribute('data-top', String(bottom - 190));
    keyboard(320);
    expect(animatorFor(bar).get('y')).toBe(0);
  });

  it("never moves an app's bar the app already moves with the keyboard, even when its listener runs after the module's", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    // The app follows the keyboard with its own transform, from a listener
    // added after the module's, so it runs later in each report.
    const follow = () => {
      const cover = window.innerHeight - viewport.height;
      bar.style.transform = `matrix(1, 0, 0, 1, 0, ${-cover})`;
    };
    viewport.addEventListener('resize', follow);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(0);
    expect(bar.style.translate).toBe('');
    expect(bar.style.transform).toBe('matrix(1, 0, 0, 1, 0, -300)');
    viewport.removeEventListener('resize', follow);
  });

  it("never moves an app's bar the app already moves with the keyboard from a listener that runs before the module's", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    // The app's listener is added before the module subscribes, so it runs
    // first in each report.
    const follow = () => {
      const cover = window.innerHeight - viewport.height;
      bar.style.transform = `matrix(1, 0, 0, 1, 0, ${-cover})`;
    };
    viewport.addEventListener('resize', follow);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(0);
    expect(bar.style.translate).toBe('');
    viewport.removeEventListener('resize', follow);
  });

  it("moves an app's bar the app lifts part of the way only by the rest, and keeps the app's transform", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    const liftPart = () => {
      bar.style.transform = 'matrix(1, 0, 0, 1, 0, -100)';
    };
    viewport.addEventListener('resize', liftPart);
    keyboard(300);
    // The keyboard still covered 200 px of the bar after the app's 100.
    expect(animatorFor(bar).get('y')).toBe(-200);
    expect(bar.style.transform).toBe('matrix(1, 0, 0, 1, 0, -100)');
    expect(boxOf(bar).bottom).toBe(bottom - 300);
    viewport.removeEventListener('resize', liftPart);
  });

  it("leaves an app's docked bar that positions itself with its own translate exactly as it is", () => {
    const bottom = window.innerHeight;
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    // A bar the app centres with `translate`.
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed', translate: '-50% 0'},
    );
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(other, bar);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    // No claim: the browser's own focus step runs, as without Core.
    expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    expect(bar.style.translate).toBe('-50% 0');
    expect(scrollBy).not.toHaveBeenCalled();
    keyboard(0);
    expect(bar.style.translate).toBe('-50% 0');
  });

  it("leaves an app's bar the app is moving itself, a transition or animation running on its position, to the app", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    // A CSS transition the app runs on the bar's transform.
    let running: unknown[] = [
      {playState: 'running', transitionProperty: 'transform'},
    ];
    Object.defineProperty(bar, 'getAnimations', {
      configurable: true,
      value: () => running,
    });
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(0);
    expect(bar.style.translate).toBe('');
    // A CSS animation of its bottom edge is the app's move too.
    running = [
      {
        playState: 'running',
        animationName: 'rise',
        effect: {
          getKeyframes: () => [
            {offset: 0, bottom: '0px'},
            {offset: 1, bottom: '300px'},
          ],
        },
      },
    ];
    keyboard(320);
    expect(bar.style.translate).toBe('');
    // Once the app's move ends, the bar rides by what the keyboard covers.
    running = [];
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(-300);
  });

  it("keeps its lift on a bar whose own `transition: all` animates the ride's translate", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed', transition: 'all 300ms'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    let running: unknown[] = [];
    Object.defineProperty(bar, 'getAnimations', {
      configurable: true,
      value: () => running,
    });
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(-300);
    // The ride's write starts the bar's own transition on `translate`.
    running = [{playState: 'running', transitionProperty: 'translate'}];
    keyboard(310);
    expect(animatorFor(bar).get('y')).toBe(-310);
  });

  it("rides a bar the app moves only with a script animation, which a CSS motion alone marks as the app's", () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    Object.defineProperty(bar, 'getAnimations', {
      configurable: true,
      value: () => [
        // The app's own script animation of the bar's transform.
        {
          playState: 'running',
          effect: {
            getKeyframes: () => [
              {offset: 0, transform: 'none'},
              {offset: 1, transform: 'translateY(-40px)'},
            ],
          },
        },
      ],
    });
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(-300);
  });

  it('still rides a bar whose running animations are only its own ride or no move at all', () => {
    const bottom = window.innerHeight;
    const bar = element(
      'div',
      {top: bottom - 60, height: 60},
      {position: 'fixed'},
    );
    const input = element('input', {top: bottom - 50, height: 40});
    bar.append(input);
    document.body.append(bar);
    Object.defineProperty(bar, 'getAnimations', {
      configurable: true,
      value: () => [
        // The ride's own script animation of `translate`.
        {
          playState: 'running',
          effect: {
            getKeyframes: () => [
              {offset: 0, translate: '0px 0px'},
              {offset: 1, translate: '0px -300px'},
            ],
          },
        },
        // An app fade, which moves nothing.
        {playState: 'running', transitionProperty: 'opacity'},
        // A finished move.
        {playState: 'finished', transitionProperty: 'transform'},
      ],
    });
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(animatorFor(bar).get('y')).toBe(-300);
  });

  it.each([
    [
      'a fixed bar floating above the bottom edge',
      (bottom: number) =>
        element('div', {top: bottom - 600, height: 500}, {position: 'fixed'}),
      '',
    ],
    [
      'a docked bar that sets its own translate',
      (bottom: number) =>
        element(
          'div',
          {top: bottom - 500, height: 500},
          {position: 'fixed', translate: '-50% 0'},
        ),
      '-50% 0',
    ],
  ] as const)(
    'reveals a field in %s through the scroller around it, and never moves the container',
    (_, container, translate) => {
      const bottom = window.innerHeight;
      const scrollBy = vi.fn();
      vi.stubGlobal('scrollBy', scrollBy);
      const fixed = container(bottom);
      const box = fixed.getBoundingClientRect();
      const list = element(
        'div',
        {top: box.top, height: 500},
        {overflowY: 'auto'},
      );
      Object.defineProperty(list, 'scrollHeight', {value: 1500});
      Object.defineProperty(list, 'clientHeight', {value: 500});
      let listTop = 0;
      Object.defineProperty(list, 'scrollTop', {
        configurable: true,
        get: () => listTop,
        set: (value: number) => {
          listTop = Math.max(0, Math.min(1000, value));
        },
      });
      const other = element('input', {top: 10, height: 40});
      const input = element('input', {top: box.bottom - 60, height: 40});
      list.append(input);
      fixed.append(list);
      document.body.append(other, fixed);
      track(keepFieldAboveKeyboard(input));
      focusOn(other);
      const focus = vi.spyOn(input, 'focus');
      focusOn(input);
      // The focus move is claimed: the scroller in the container reveals the
      // field, and the page is not panned.
      expect(focus).toHaveBeenCalledWith({preventScroll: true});
      keyboard(300);
      const keyboardTop = bottom - 300;
      expect(list.scrollTop).toBe(
        box.bottom - 20 - (keyboardTop - FIELD_OFFSET),
      );
      expect(scrollBy).not.toHaveBeenCalled();
      expect(fixed.style.translate).toBe(translate);
    },
  );

  it("leaves a field in a fixed bar floating above the bottom edge to the browser's own reveal", () => {
    const bottom = window.innerHeight;
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const floating = element(
      'div',
      {top: bottom - 140, height: 60},
      {position: 'fixed'},
    );
    const other = element('input', {top: 10, height: 40});
    const input = element('input', {top: bottom - 130, height: 40});
    floating.append(input);
    document.body.append(other, floating);
    track(keepFieldAboveKeyboard(input));
    focusOn(other);
    const focus = vi.spyOn(input, 'focus');
    focusOn(input);
    expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
    keyboard(300);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(floating.style.translate).toBe('');
  });

  it('reveals the next field at once when focus moves with the keyboard up, with no new report', () => {
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    Object.defineProperty(list, 'scrollHeight', {value: 2000});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    const first = element('input', {top: 100, height: 40});
    const next = element('input', {top: 640, height: 40});
    list.append(first, next);
    document.body.append(list);
    track(followKeyboard(list, {move: 'reveal', offset: FIELD_OFFSET}));
    focusOn(first);
    keyboard(300);
    expect(list.scrollTop).toBe(0);
    focusOn(next);
    expect(list.scrollTop).toBe(
      680 + FIELD_OFFSET - (window.innerHeight - 300),
    );
  });

  it('lifts a ridden target only while focus is inside it, so it never covers a field outside', () => {
    const bottom = window.innerHeight;
    const page = element('input', {top: 300, height: 40});
    const dock = element(
      'div',
      {top: bottom - 80, height: 80},
      {position: 'fixed'},
    );
    const input = element('textarea', {top: bottom - 64, height: 48});
    dock.append(input);
    document.body.append(page, dock);
    track(followKeyboard(dock, {move: 'ride', offset: 8}));
    focusOn(page);
    keyboard(320);
    expect(animatorFor(dock).get('y')).toBe(0);
    focusOn(input);
    expect(animatorFor(dock).get('y')).toBe(-320);
    focusOn(page);
    expect(animatorFor(dock).get('y')).toBe(0);
  });

  it('keeps a ridden target on the keyboard as it goes when focus leaves for nothing', () => {
    const bottom = window.innerHeight;
    const dock = element(
      'div',
      {top: bottom - 80, height: 80},
      {position: 'fixed'},
    );
    const input = element('textarea', {top: bottom - 64, height: 48});
    dock.append(input);
    document.body.append(dock);
    track(followKeyboard(dock, {move: 'ride', offset: 8}));
    focusOn(input);
    keyboard(320);
    expect(animatorFor(dock).get('y')).toBe(-320);
    act(() => input.blur());
    expect(animatorFor(dock).get('y')).toBe(-320);
    keyboard(120);
    expect(animatorFor(dock).get('y')).toBe(-120);
    keyboard(0);
    expect(animatorFor(dock).get('y')).toBe(0);
  });

  it('reveals the focused field inside a scrolling target', () => {
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    Object.defineProperty(list, 'scrollHeight', {value: 2000});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    const input = element('input', {top: 620, height: 40});
    list.append(input);
    document.body.append(list);
    track(followKeyboard(list, {move: 'reveal', offset: FIELD_OFFSET}));
    focusOn(input);
    keyboard(300);
    expect(list.scrollTop).toBe(
      660 + FIELD_OFFSET - (window.innerHeight - 300),
    );
  });
});
