// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PanGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output PanGestureRecognizer's state machine: the per-axis hysteresis and the translation without it, directions and axisRatio, the release velocity, axis lock, finger changes, setTranslation, cancellation
 * @position Unit tests of packages/core/src/gestures/PanGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {createHarness, scrollProbe} from './harness';

describe('PanGestureRecognizer', () => {
  it('begins past the hysteresis and leaves the threshold out of the translation', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    const hysteresis = UIKIT_GESTURES.pan.hysteresis.value;
    h.finger(1).down(100, 100, 0, {recognizers: [pan]});
    h.finger(1).move(100 + hysteresis - 0.1, 100, 16);
    expect(pan.state).toBe('possible');
    h.finger(1).move(100 + hysteresis + 2, 100, 32);
    expect(pan.state).toBe('began');
    // UIKit: the overshoot past the threshold, not the travel since touch-down.
    expect(pan.translation()).toEqual({x: 2, y: 0});
    expect(pan.travelAtBegan).toEqual({x: hysteresis, y: 0});
    expect(pan.totalTranslation()).toEqual({x: hysteresis + 2, y: 0});
    h.finger(1).move(150, 120, 48);
    expect(pan.state).toBe('changed');
    expect(pan.translation()).toEqual({x: 40, y: 20});
    expect(pan.totalTranslation()).toEqual({x: 50, y: 20});
  });

  it('applies the hysteresis per axis, as UIKit does', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    // 10.6 px away on the diagonal, but under 10 on each axis: not yet.
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(7.5, 7.5, 16);
    expect(pan.state).toBe('possible');
    // UIKit's slow diagonal: began at (10.67, 10.67), translation (0.67, 0.67).
    h.finger(1).move(10.5, 10.5, 32);
    expect(pan.state).toBe('began');
    expect(pan.translation()).toEqual({x: 0.5, y: 0.5});
    // A 3:1 drag crossing at (11, 3.67) reads (1, 0) in UIKit.
    const slope = createHarness();
    const other = new PanGestureRecognizer({name: 'other'});
    slope
      .finger(1)
      .down(0, 0, 0, {recognizers: [other]})
      .move(9, 3, 16)
      .move(11, 3.5, 32);
    expect(other.translation()).toEqual({x: 1, y: 0});
  });

  it('ends with the release velocity in px/s', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    let releaseVelocity = {x: 0, y: 0};
    pan.addListener(r => {
      if (r.state === 'ended') {
        releaseVelocity = r.velocity();
      }
    });
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [pan]});
    // 1 px/ms = 1000 px/s, sampled every 8 ms.
    for (let t = 8; t <= 160; t += 8) {
      finger.move(t, 0, t);
    }
    finger.up(168);
    expect(releaseVelocity.x).toBeCloseTo(1000, 0);
    expect(releaseVelocity.y).toBeCloseTo(0, 5);
  });

  it('releases at 0 after a rest longer than the stillness interval (AST-100 FR2)', () => {
    const stillness = UIKIT_GESTURES.velocity.stillness.value;
    const release = (liftAt: number) => {
      const h = createHarness();
      const pan = new PanGestureRecognizer({name: 'pan'});
      let releaseVelocity = {x: -1, y: -1};
      pan.addListener(r => {
        if (r.state === 'ended') {
          releaseVelocity = r.velocity();
        }
      });
      const finger = h.finger(1).down(0, 0, 0, {recognizers: [pan]});
      finger.drag(200, 0, 100, 10);
      // A still finger sends no events until it lifts.
      finger.up(liftAt);
      return releaseVelocity;
    };
    // Lifted within the interval: the moving value, as UIKit reports it.
    expect(release(100 + stillness).x).toBeCloseTo(2000, 6);
    // Rested longer: no flick, where UIKit would still fling.
    expect(release(100 + stillness + 60)).toEqual({x: 0, y: 0});
  });

  it('fails a drag against its direction', () => {
    const vertical = createHarness();
    const horizontal = new PanGestureRecognizer({
      name: 'h',
      direction: 'horizontal',
    });
    vertical
      .finger(1)
      .down(0, 0, 0, {recognizers: [horizontal]})
      .drag(3, 20, 50);
    expect(horizontal.state).toBe('failed');

    const up = createHarness();
    const down = new PanGestureRecognizer({name: 'down', direction: 'down'});
    up.finger(1)
      .down(0, 100, 0, {recognizers: [down]})
      .drag(0, -30, 50);
    expect(down.state).toBe('failed');
  });

  it('decides by 10 px with an axisRatio above 1: between the lines it fails (spec:AST-094 FR19), on its axis it begins', () => {
    const between = createHarness();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      direction: 'vertical',
      axisRatio: 2,
    });
    between
      .finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(8, 12, 16);
    // 12 is not more than 2 x 8, and not less than 8: undecided past 10 px.
    expect(pan.state).toBe('failed');
    expect(between.claims).toEqual([]);

    const along = createHarness();
    const steep = new PanGestureRecognizer({
      name: 'steep',
      direction: 'vertical',
      axisRatio: 2,
    });
    along
      .finger(1)
      .down(0, 0, 0, {recognizers: [steep]})
      .move(4, 12, 16);
    expect(steep.state).toBe('began'); // 12 > 2 x 4

    const diagonal = createHarness();
    const side = new PanGestureRecognizer({
      name: 'side',
      direction: 'vertical',
      axisRatio: 2,
    });
    diagonal
      .finger(1)
      .down(0, 0, 0, {recognizers: [side]})
      .move(10, 9, 16);
    expect(side.state).toBe('failed'); // more across than along
  });

  it('claims drags up to atan(1 / axisRatio) off its axis below 1', () => {
    const steep = createHarness();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      direction: 'horizontal',
      axisRatio: 0.5,
    });
    // 60 degrees off horizontal: 10 across 17 along y; 10 > 0.5 x 17.
    steep
      .finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(10, 17, 16);
    expect(pan.state).toBe('began');

    const steeper = createHarness();
    const other = new PanGestureRecognizer({
      name: 'other',
      direction: 'horizontal',
      axisRatio: 0.5,
    });
    // 68 degrees: 8 < 0.5 x 20.
    steeper
      .finger(1)
      .down(0, 0, 0, {recognizers: [other]})
      .move(8, 20, 16);
    expect(other.state).toBe('failed');
  });

  it('decides the sign of a one-way pan once its axis is decided', () => {
    const h = createHarness();
    const down = new PanGestureRecognizer({
      name: 'down',
      direction: 'down',
      axisRatio: 1.2,
    });
    // 9 along, 8 across: not 1.2 times more, not less either: wait.
    h.finger(1)
      .down(0, 100, 0, {recognizers: [down]})
      .move(8, 109, 16);
    expect(down.state).toBe('possible');
    // The axis is now clearly vertical, and the movement is up.
    h.finger(1).move(8, 70, 32);
    expect(down.state).toBe('failed');
  });

  it('locks to the dominant axis when asked', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan', lockAxis: true});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(12, 4, 16)
      .move(40, 30, 32);
    expect(pan.lockedAxis).toBe('x');
    expect(pan.translation()).toEqual({x: 30, y: 0});
  });

  it('ignores a second finger once moving, so it never breaks the first', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      maximumNumberOfTouches: 1,
    });
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(20, 0, 16);
    expect(pan.state).toBe('began');
    h.finger(2).down(200, 200, 30, {recognizers: [pan]});
    expect(pan.numberOfTouches).toBe(1);
    h.finger(2).move(260, 260, 40);
    h.finger(1).move(30, 0, 48);
    expect(pan.translation()).toEqual({x: 20, y: 0});
    h.finger(2).up(60);
    expect(pan.state).toBe('changed');
    h.finger(1).up(70);
    expect(pan.state).toBe('possible');
    expect(h.log).toContain('pan:ended@70');
  });

  it('fails when a second finger lands before it began', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      maximumNumberOfTouches: 1,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [pan]});
    h.finger(2).down(50, 0, 10, {recognizers: [pan]});
    expect(pan.state).toBe('failed');
  });

  it('keeps the translation continuous when fingers join and leave', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(30, 0, 16);
    expect(pan.translation()).toEqual({x: 20, y: 0});
    // A second finger far away moves the centroid by 100 px: no jump.
    h.finger(2).down(230, 0, 20, {recognizers: [pan]});
    expect(pan.translation()).toEqual({x: 20, y: 0});
    h.finger(1).move(40, 0, 32);
    h.finger(2).move(240, 0, 32);
    expect(pan.translation()).toEqual({x: 30, y: 0});
    h.finger(2).up(40);
    expect(pan.translation()).toEqual({x: 30, y: 0});
    h.finger(1).move(50, 0, 48);
    expect(pan.translation()).toEqual({x: 40, y: 0});
  });

  it('waits for the minimum number of touches', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      minimumNumberOfTouches: 2,
    });
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(40, 0, 16);
    expect(pan.state).toBe('possible');
    h.finger(2).down(100, 0, 20, {recognizers: [pan]});
    h.finger(1).move(60, 0, 32);
    expect(pan.state).toBe('began');
    expect(h.log).toEqual(['pan:began@32']);
  });

  it('can re-base its translation (setTranslation)', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(30, 0, 16);
    pan.setTranslation({x: 0, y: 0});
    h.finger(1).move(35, 2, 32);
    expect(pan.translation()).toEqual({x: 5, y: 2});
  });

  it('is cancelled by the system', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(30, 0, 16);
    h.finger(1).cancel(32);
    expect(h.log).toEqual([
      'pan:began@16',
      'pan:cancelled@32',
      'pan:possible@32',
    ]);
  });

  it('claims nothing before it begins at 10 pt: a 5–9 pt drag leaves the touch to the browser (spec:AST-094 FR17)', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan', direction: 'up'});
    const finger = h.finger(1).down(0, 100, 0, {recognizers: [pan]});
    for (const [y, time] of [
      [95, 16],
      [93, 32],
      [91, 48],
    ] as const) {
      finger.move(0, y, time);
      expect(pan.state).toBe('possible');
      expect(h.claims).toEqual([]);
    }
    finger.move(0, 90, 64);
    expect(pan.state).toBe('began');
    expect(h.claims).toEqual([1]);
    finger.up(80);
  });
});
