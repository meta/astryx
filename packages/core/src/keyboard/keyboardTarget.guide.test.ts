// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardTarget.guide.test.ts
 * @input keyboardTarget.ts with a stand-in layout guide and a stand-in
 *   animator, a stand-in visual viewport and stubbed boxes
 * @output Proves a docked ride on the guide's slides. A show sets the field
 *   just above the keyboard at once and rides the rest. A pan the browser
 *   makes is put back, also one made at the last height. A field that loses
 *   focus while the keyboard shows rides its bar down on the hide's slide. No
 *   set cuts the slide at its start
 * @position Keyboard module tests
 */

import {afterEach, beforeEach, expect, it, onTestFinished, vi} from 'vitest';
import {act} from '@testing-library/react';
import {keyboard as androidKeyboard} from '../motion/android';
import type {KeyboardTransition} from './keyboardModel';
import type * as LayoutGuideModule from './keyboardLayoutGuide';
import type * as AnimatorModule from '../motion/animator';
import {
  installKeyboardTestDouble,
  type KeyboardTestDouble,
} from './__tests__/keyboardTestDouble';

const guideListeners = new Set<(transition: KeyboardTransition) => void>();
// The inset the stand-in guide reports: the last published slide's end.
const guideState = {inset: 0};
// A stand-in animator that keeps the y it was last sent, and draws it on the
// bar as the real one does.
const animator = vi.hoisted(() => {
  const state = {y: 0, element: null as HTMLElement | null};
  const draw = (y: number) => {
    state.y = y;
    if (state.element != null) {
      state.element.style.translate = y === 0 ? '' : `0px ${y}px`;
    }
  };
  return {
    state,
    set: vi.fn((values: {y?: number}) => draw(values.y ?? state.y)),
    play: vi.fn(
      (curves: {y?: {duration: number; at: (t: number) => number}}) => {
        if (curves.y != null) {
          draw(curves.y.at(curves.y.duration));
        }
        return {finished: Promise.resolve(true)};
      },
    ),
    animate: vi.fn(() => ({finished: Promise.resolve(true)})),
    get: vi.fn(() => state.y),
  };
});

vi.mock('./keyboardLayoutGuide', async importOriginal => {
  const actual = await importOriginal<typeof LayoutGuideModule>();
  return {
    ...actual,
    keyboardProfileOf: () => 'chromium',
    getKeyboardLayoutGuide: () => ({
      get inset() {
        return guideState.inset;
      },
      subscribe: (listener: (transition: KeyboardTransition) => void) => {
        guideListeners.add(listener);
        return () => guideListeners.delete(listener);
      },
    }),
  };
});

vi.mock('../motion/animator', async importOriginal => {
  const actual = await importOriginal<typeof AnimatorModule>();
  return {...actual, animatorFor: () => animator};
});

const {keepFieldAboveKeyboard, FIELD_CLEARANCE_AT_REPORT} =
  await import('./keyboardTarget');

let keyboard: KeyboardTestDouble;

const slide = (kind: 'show' | 'hide', to: number): KeyboardTransition => ({
  kind,
  from: kind === 'show' ? 0 : 300,
  to,
  start: 1000,
  velocity: 0,
  animated: true,
  predicted: false,
  curve:
    kind === 'show'
      ? {durationMs: androidKeyboard.showMs, points: androidKeyboard.showCurve}
      : {durationMs: androidKeyboard.hideMs, points: androidKeyboard.hideCurve},
});

function publish(transition: KeyboardTransition) {
  guideState.inset = transition.to;
  act(() => {
    for (const listener of [...guideListeners]) {
      listener(transition);
    }
  });
  keyboard.frame();
}

beforeEach(() => {
  keyboard = installKeyboardTestDouble();
  vi.spyOn(performance, 'now').mockReturnValue(1000);
});

afterEach(() => {
  keyboard.restore();
  guideListeners.clear();
  guideState.inset = 0;
  animator.state.y = 0;
  animator.state.element = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("rides a blurred field's bar down on the hide's slide, never cutting it with a set", () => {
  const bottom = window.innerHeight;
  const bar = document.createElement('div');
  bar.style.position = 'fixed';
  const input = document.createElement('input');
  bar.append(input);
  document.body.append(bar);
  animator.state.element = bar;
  // Where the bar and its field draw: their layout, moved by the ride.
  vi.spyOn(bar, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, bottom - 60 + animator.state.y, 300, 60),
  );
  vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, bottom - 50 + animator.state.y, 300, 40),
  );
  const stop = keepFieldAboveKeyboard(input);
  act(() => input.focus());
  keyboard.frame();
  publish(slide('show', 300));
  expect(animator.play).toHaveBeenCalled();
  // The field loses focus while the keyboard still shows, and that moves
  // nothing until the keyboard goes.
  keyboard.show(300);
  animator.set.mockClear();
  animator.play.mockClear();
  act(() => input.blur());
  expect(animator.set).not.toHaveBeenCalled();
  expect(animator.play).not.toHaveBeenCalled();
  publish(slide('hide', 0));
  // The bar rides to rest on the hide's slide, and nothing sets it there at
  // the slide's start.
  expect(animator.play).toHaveBeenCalledTimes(1);
  expect(animator.set).not.toHaveBeenCalled();
  // The stopped ride no longer listens: a later slide moves nothing.
  publish(slide('show', 300));
  expect(animator.play).toHaveBeenCalledTimes(1);
  stop();
});

// A bar docked at the viewport's bottom with a field 10 px above its bottom,
// both drawn where the ride moves them.
function dockedBar() {
  const bottom = window.innerHeight;
  const bar = document.createElement('div');
  bar.style.position = 'fixed';
  const input = document.createElement('input');
  bar.append(input);
  document.body.append(bar);
  animator.state.element = bar;
  vi.spyOn(bar, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, bottom - 60 + animator.state.y, 300, 60),
  );
  vi.spyOn(input, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, bottom - 50 + animator.state.y, 300, 40),
  );
  return {bar, input};
}

it("sets a docked bar's field just above the keyboard at the show's first report, then rides the rest", () => {
  const {input} = dockedBar();
  const stop = keepFieldAboveKeyboard(input);
  act(() => input.focus());
  keyboard.frame();
  animator.set.mockClear();
  animator.play.mockClear();
  publish(slide('show', 300));
  // The field's bottom, 10 px above the viewport's bottom, is set
  // FIELD_CLEARANCE_AT_REPORT px above the keyboard's top at once.
  expect(animator.set).toHaveBeenCalledWith({
    y: -(300 - 10 + FIELD_CLEARANCE_AT_REPORT),
  });
  // The rest rides on the slide, to the bar's bottom on the keyboard's top.
  expect(animator.play).toHaveBeenCalledTimes(1);
  expect(animator.set.mock.invocationCallOrder[0]).toBeLessThan(
    animator.play.mock.invocationCallOrder[0],
  );
  expect(animator.state.y).toBe(-300);
  stop();
});

it('puts back a pan the browser makes on its own while a docked bar rides its field', () => {
  const {input} = dockedBar();
  const stop = keepFieldAboveKeyboard(input);
  act(() => input.focus());
  keyboard.frame();
  publish(slide('show', 300));
  keyboard.show(300);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  // The browser pans the visual viewport by itself: no touch, no scroll.
  keyboard.viewport.offsetTop = 48;
  act(() => {
    keyboard.viewport.dispatchEvent(new Event('scroll'));
  });
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(keyboard.viewport.offsetTop).toBe(0);
  stop();
});

// Chrome with Remove animations: Gboard first reports a keyboard 48 px tall,
// and the bar lands on its top. The page sits scrolled to 154.3.
function interimKeyboard() {
  const {viewport} = keyboard;
  const page = {scrollY: 154.3};
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => page.scrollY,
  });
  const scrollTo = vi.fn(({top}: {top: number}) => {
    page.scrollY = top;
  });
  vi.stubGlobal('scrollTo', scrollTo);
  const {input} = dockedBar();
  const stop = keepFieldAboveKeyboard(input);
  act(() => input.focus());
  keyboard.frame();
  keyboard.show(48);
  publish({...slide('show', 48), animated: false});
  expect(animator.state.y).toBe(-48);
  // How far Chrome's reveal moves to centre the field in the visual viewport.
  const box = input.getBoundingClientRect();
  const centring = (box.top + box.bottom) / 2 - viewport.height / 2;
  const land = (scrollY: number, offsetTop: number) => {
    page.scrollY = scrollY;
    viewport.offsetTop = offsetTop;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
  };
  onTestFinished(() => {
    Reflect.deleteProperty(window, 'scrollY');
    stop();
  });
  return {viewport, page, scrollTo, centring, input, land};
}

it("puts back, at the keyboard's real report, a pan the browser made at the last height", () => {
  const {viewport} = interimKeyboard();
  // A pan with no report of its own, which only the next height's report sees.
  viewport.offsetTop = 48;
  keyboard.show(336);
  publish({...slide('show', 336), from: 48});
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(viewport.offsetTop).toBe(0);
  expect(animator.state.y).toBe(-336);
});

it("puts back Chrome's own reveal of a docked bar's field, its document scroll and its pan, as soon as it lands, and not the app's later scroll", () => {
  const {viewport, page, scrollTo, centring, land} = interimKeyboard();
  // Chrome reveals the field as if it scrolled with the page. The document
  // scroll centres its document position, which moves only the page behind
  // the fixed bar. The pan takes the 48 px the keyboard leaves.
  land(154.3 + centring, 48);
  expect(scrollTo).toHaveBeenCalledWith({
    left: 0,
    top: 154.3,
    behavior: 'instant',
  });
  expect(page.scrollY).toBe(154.3);
  expect(viewport.offsetTop).toBe(0);
  land(300, 48);
  expect(scrollTo).toHaveBeenCalledTimes(1);
  keyboard.show(336);
  publish({...slide('show', 336), from: 48});
  expect(animator.state.y).toBe(-336);
  expect(page.scrollY).toBe(300);
  expect(viewport.offsetTop).toBe(48);
});

it("leaves an app's own scroll to another element that pans while a docked bar's field has focus, and reads no layout for it again", () => {
  const {viewport, page, scrollTo, input, land} = interimKeyboard();
  // The app scrolls a page element into view: the document scrolls and the
  // visual viewport pans, but the field's document position is not centred.
  land(300, 48);
  // Whether a scroll is Chrome's reveal is decided once per report.
  const reads = vi.mocked(input.getBoundingClientRect).mock.calls.length;
  land(300, 48);
  expect(input.getBoundingClientRect).toHaveBeenCalledTimes(reads);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(page.scrollY).toBe(300);
  expect(viewport.offsetTop).toBe(48);
});

it("leaves a scroll that centres the field when the pan stops short of Chrome's reveal", () => {
  const {viewport, scrollTo, centring, land} = interimKeyboard();
  // Chrome's pan takes all 48 px the keyboard leaves; this one stops at 20.
  land(154.3 + centring, 20);
  expect(scrollTo).not.toHaveBeenCalled();
  expect(viewport.offsetTop).toBe(20);
});
