// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardTarget.guide.test.ts
 * @input keyboardTarget.ts with a stand-in layout guide and a stand-in
 *   animator, a stand-in visual viewport and stubbed boxes
 * @output Proves a docked ride on the guide's slides. A field that loses
 *   focus while the keyboard shows rides its bar down on the hide's slide. No
 *   set cuts the slide at its start
 * @position Keyboard module tests
 */

import {afterEach, beforeEach, expect, it, vi} from 'vitest';
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

const {keepFieldAboveKeyboard} = await import('./keyboardTarget');

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
