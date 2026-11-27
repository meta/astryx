// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {judgeAgainstControl} from './busyMotionJudge';

const FRAME_MS = 16.5;

/** A screencast of `deltas.length + 1` frames in which the control moves 10 px on every frame. */
function cast(alertDeltas: ReadonlyArray<number>) {
  const alert = [{t: 0, luma: 182}];
  const control = [{box: {x: 0, y: 0, width: 20, height: 20}}];
  alertDeltas.forEach((delta, k) => {
    const i = k + 1;
    alert.push({t: i * FRAME_MS, luma: alert[k].luma + delta});
    control.push({box: {x: i * 10, y: 0, width: 20, height: 20}});
  });
  return {alert, control, window: {from: 0, to: alert.length * FRAME_MS}};
}

describe('judgeAgainstControl', () => {
  it('misses every frame of an alert that does not change', () => {
    const {alert, control, window} = cast(Array(12).fill(0));
    expect(judgeAgainstControl(alert, control, window)).toEqual({
      controlMoved: 12,
      missed: 12,
      longestAlertStall: 12,
      longestControlStall: 0,
    });
  });

  // The luma of an alert that fades over a black dim changes slowly near the
  // curve's stationary point. Frame pacing then alternates large and small
  // steps, as in a recorded trace: -0.28, -0.05, -0.27, -0.08.
  it('misses no frame of an alert that changes slowly', () => {
    const {alert, control, window} = cast([
      -0.28, -0.049, -0.27, -0.085, -0.25, -0.043, -0.35, -0.07,
    ]);
    expect(judgeAgainstControl(alert, control, window)).toMatchObject({
      controlMoved: 8,
      missed: 0,
      longestAlertStall: 0,
    });
  });

  it('counts one repeated frame inside motion as a stall of one frame', () => {
    const {alert, control, window} = cast([-0.28, -0.27, 0, -0.25, -0.26]);
    expect(judgeAgainstControl(alert, control, window)).toMatchObject({
      controlMoved: 5,
      missed: 1,
      longestAlertStall: 1,
      longestControlStall: 0,
    });
  });

  it('judges only the frames inside the window', () => {
    const {alert, control} = cast([0, 0, -0.28, -0.27]);
    expect(
      judgeAgainstControl(alert, control, {from: 2.5 * FRAME_MS, to: 99}),
    ).toMatchObject({controlMoved: 2, missed: 0});
  });
});
