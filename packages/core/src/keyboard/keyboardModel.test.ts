// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyboardModel.test.ts
 * @input vitest, createKeyboardModel, the Android keyboard table
 * @output Tests the keyboard layout guide's core on Chrome. Transitions come
 *   from Chrome's reports, dated back to Gboard's start, on Gboard's slides.
 *   Also covered: a hide predicted from the blur, the accessory bar's
 *   report, and focus that comes back during a predicted hide.
 * @position Unit tests for keyboard/keyboardModel.ts
 */

import {describe, expect, it} from 'vitest';
import {createKeyboardModel} from './keyboardModel';
import {keyboard as androidKeyboard} from '../motion/android';
import {cubicBezier} from '../motion/bezier';

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
