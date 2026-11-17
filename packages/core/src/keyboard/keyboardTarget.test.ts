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

  it('scrolls only its nearest scroller, and nothing else, when that scroller cannot scroll far enough', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    const list = element('div', {top: 0, height: 760}, {overflowY: 'auto'});
    Object.defineProperty(list, 'scrollHeight', {value: 900});
    Object.defineProperty(list, 'clientHeight', {value: 760});
    // The list has 140 px of range left.
    let listTop = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => listTop,
      set: (value: number) => {
        listTop = Math.max(0, Math.min(140, value));
      },
    });
    const input = element('input', {top: 660, height: 40});
    list.append(input);
    document.body.append(list);
    track(keepFieldAboveKeyboard(input));
    focusOn(input);
    keyboard(300);
    expect(list.scrollTop).toBe(140);
    // The page stays where it is; the rest of the field stays covered.
    expect(scrollBy).not.toHaveBeenCalled();
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
