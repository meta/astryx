// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardModel.test.ts
 * @input vitest, createKeyboardModel, the Android keyboard table
 * @output Tests the keyboard layout guide's core on Chrome. Transitions come
 *   from Chrome's reports, dated back to Gboard's start, on Gboard's slides.
 *   Also covered: a hide predicted from the blur, the accessory bar's
 *   report, and focus that comes back during a predicted hide. On iOS,
 *   transitions ride UIKit's keyboard spring from Safari's report and from
 *   the blur.
 * @position Unit tests for keyboard/keyboardModel.ts
 */

import {describe, expect, it} from 'vitest';
import {createKeyboardModel} from './keyboardModel';
import {keyboard as androidKeyboard} from '../motion/android';
import {cubicBezier} from '../motion/bezier';
import {KEYBOARD_SPRING} from '../motion/uikit/springs';
import {timing as uikitTiming} from '../motion/uikit/timing';
import {isElement} from '../utils/nodeType';
import {mayKeepKeyboard} from './keyboardTarget';
import {createUIKitKeyboardSchedule} from './uikitKeyboardSchedule';

const uikitKeyboardSchedule = createUIKitKeyboardSchedule({
  notificationMs: uikitTiming.keyboardNotificationMs,
  mayKeepKeyboard,
  isElement,
});

describe('createKeyboardModel on Chrome', () => {
  const ease = cubicBezier(androidKeyboard.hideCurve);
  const chrome = () => createKeyboardModel(0);

  it('rides a keyboard coming up from its report, dated back to Gboard’s start, on Gboard’s slide (FR8)', () => {
    const model = chrome();
    const show = model.report(312, 1000);
    const start = 1000 - androidKeyboard.showReportLagMs;
    expect(show).toMatchObject({
      kind: 'show',
      from: 0,
      to: 312,
      start,
      animated: true,
      curve: {
        durationMs: androidKeyboard.showMs,
        points: androidKeyboard.showCurve,
      },
    });
    // Joined where the slide is at the report, then on Gboard's curve.
    const easeUp = cubicBezier(androidKeyboard.showCurve);
    expect(model.presentation(1000)).toBeCloseTo(
      312 * easeUp(androidKeyboard.showReportLagMs / androidKeyboard.showMs),
      6,
    );
    expect(model.presentation(start + androidKeyboard.showMs)).toBe(312);
  });

  it('rides to the last keyboard’s height for the accessory bar’s report, then confirms it', () => {
    const model = chrome();
    model.report(312, 1000);
    model.report(0, 2000);
    const show = model.report(48, 3000);
    expect(show).toMatchObject({to: 312, animated: true, predicted: true});
    expect(model.report(312, 3120)).toBeNull();
    expect(model.transition.predicted).toBe(false);
  });

  it('moves once if the keyboard that comes is not the last one', () => {
    const model = chrome();
    model.report(312, 1000);
    model.report(0, 2000);
    model.report(48, 3000);
    const change = model.report(260, 3120);
    expect(change).toMatchObject({kind: 'change', to: 260, animated: false});
  });

  it('rides a hide down from hideAfterBlurMs after a blur, on the hide curve', () => {
    const model = chrome();
    model.report(312, 1000);
    const hide = model.blurred(2000);
    const start = 2000 + androidKeyboard.hideAfterBlurMs;
    expect(hide).toMatchObject({kind: 'hide', to: 0, start, predicted: true});
    expect(hide?.curve?.durationMs).toBe(androidKeyboard.hideMs);
    const half = androidKeyboard.hideMs / 2;
    expect(model.presentation(start + half)).toBeCloseTo(
      312 * (1 - ease(0.5)),
      6,
    );
    expect(model.presentation(start + androidKeyboard.hideMs)).toBe(0);
    // Chrome's report confirms the prediction.
    expect(model.report(0, start + 2)).toBeNull();
  });

  it('rides a hide nothing predicted (Back) down from its report, dated back to Gboard’s start', () => {
    const model = chrome();
    model.report(312, 1000);
    const hide = model.report(0, 2010);
    expect(hide).toMatchObject({
      kind: 'hide',
      to: 0,
      start: 2010 - androidKeyboard.hideReportLagMs,
      animated: true,
    });
  });

  it('turns back up on Gboard’s slide when focus returns during a predicted hide', () => {
    const model = chrome();
    model.report(312, 1000);
    model.blurred(2000);
    const back = model.focused(2060);
    expect(back).toMatchObject({kind: 'show', to: 312, animated: true});
    expect(back?.curve?.durationMs).toBe(androidKeyboard.showMs);
  });
});

describe('createKeyboardModel on iOS Safari', () => {
  const safari = () => createKeyboardModel(0, uikitKeyboardSchedule);
  // UIKit's keyboard spring is critically damped: 1 − (1 + ω₀t)·e^(−ω₀t).
  const omega = Math.sqrt(KEYBOARD_SPRING.stiffness / KEYBOARD_SPRING.mass);
  const progress = (ms: number) =>
    1 - (1 + (omega * ms) / 1000) * Math.exp((-omega * ms) / 1000);
  const span = uikitTiming.keyboardNotificationMs;

  it('rides a keyboard coming up from Safari’s one report, on UIKit’s keyboard spring cut at the notification’s duration (FR8)', () => {
    const model = safari();
    const show = model.report(336, 1000);
    expect(show).toMatchObject({
      kind: 'show',
      from: 0,
      to: 336,
      start: 1000,
      animated: true,
      predicted: false,
      curve: uikitKeyboardSchedule.curve,
    });
    expect(model.presentation(1000)).toBe(0);
    expect(model.presentation(1100)).toBeCloseTo(336 * progress(100), 6);
    expect(model.presentation(1200)).toBeCloseTo(336 * progress(200), 6);
    // Core Animation cuts the spring at the notification's duration.
    expect(model.presentation(1000 + span)).toBe(336);
  });

  it('takes Safari’s one report as the keyboard’s own height, accessory bar included, with no prediction', () => {
    const model = safari();
    model.report(336, 1000);
    model.report(0, 2000);
    const show = model.report(290, 3000);
    expect(show).toMatchObject({kind: 'show', to: 290, predicted: false});
  });

  it('rides a hide down from the blur on the same spring, and Safari’s report once the keyboard is down confirms it (FR3)', () => {
    const model = safari();
    model.report(336, 1000);
    const hide = model.blurred(2000);
    expect(hide).toMatchObject({
      kind: 'hide',
      from: 336,
      to: 0,
      start: 2000,
      animated: true,
      predicted: true,
      curve: uikitKeyboardSchedule.curve,
    });
    expect(model.presentation(2100)).toBeCloseTo(336 * (1 - progress(100)), 6);
    expect(model.presentation(2000 + span)).toBe(0);
    // Safari reports the hide about half a second after the blur.
    expect(model.report(0, 2500)).toBeNull();
    expect(model.transition.predicted).toBe(false);
  });

  it('rides a hide no blur predicted down from Safari’s report, never at once', () => {
    const model = safari();
    model.report(336, 1000);
    const hide = model.report(0, 2000);
    expect(hide).toMatchObject({
      kind: 'hide',
      to: 0,
      start: 2000,
      animated: true,
      curve: {durationMs: span},
    });
  });

  it('turns back up on the spring when focus returns during a hide it predicted', () => {
    const model = safari();
    model.report(336, 1000);
    model.blurred(2000);
    const back = model.focused(2100);
    expect(back).toMatchObject({kind: 'show', to: 336, animated: true});
    expect(back?.from).toBeCloseTo(336 * (1 - progress(100)), 6);
    expect(back?.curve).toBe(uikitKeyboardSchedule.curve);
  });
});
