// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  drag,
  flick,
  holdThenDrag,
  merge,
  path,
  pinch,
  releaseVelocity,
  rotate,
  tap,
  toTouchEvents,
  withFinger,
} from './scripts';

describe('touch scripts', () => {
  it('tap presses and lifts in place', () => {
    expect(
      toTouchEvents(tap({x: 5, y: 6}, {holdMs: 80})).map(e => [e.t, e.type]),
    ).toEqual([
      [0, 'touchStart'],
      [80, 'touchEnd'],
    ]);
  });

  it('drag moves at 60 Hz, holds, rests and lifts', () => {
    const script = drag(
      {x: 0, y: 0},
      {x: 0, y: 100},
      {durationMs: 100, hz: 60, holdMs: 500, restMs: 150},
    );
    const events = toTouchEvents(script);
    expect(events[0]).toMatchObject({t: 0, type: 'touchStart'});
    const moves = events.filter(e => e.type === 'touchMove');
    expect(moves).toHaveLength(6);
    expect(moves[0].t).toBeCloseTo(516.667, 3);
    expect(moves.at(-1)).toMatchObject({
      t: 600,
      fingers: [{id: 0, x: 0, y: 100}],
    });
    expect(events.at(-1)).toMatchObject({
      t: 750,
      type: 'touchEnd',
      fingers: [],
    });
    // A rest of 100 ms or more releases nothing in motion.
    expect(releaseVelocity(script)).toEqual({x: 0, y: 0});
  });

  it('flick releases at exactly the scripted velocity', () => {
    const script = flick(
      {x: 10, y: 10},
      {velocity: {x: 0, y: 1500}, durationMs: 80, hz: 120},
    );
    expect(releaseVelocity(script).y).toBeCloseTo(1500, 6);
    const last = script.at(-2)!;
    expect(last.fingers[0].y).toBeCloseTo(10 + 1500 * 0.08, 6);
    // The lift lands a quarter frame after the last move, still moving.
    expect(script.at(-1)!.t - last.t).toBeCloseTo(1000 / 120 / 4, 6);
  });

  it('flick follows a velocity profile', () => {
    const script = flick(
      {x: 0, y: 0},
      {velocity: {x: 1000, y: 0}, durationMs: 100, hz: 100, profile: p => p},
    );
    // Linear ramp: distance = v * T / 2.
    expect(script.at(-2)!.fingers[0].x).toBeCloseTo(50, 6);
  });

  it('pinch and rotate keep two fingers about the centre', () => {
    const spread = pinch({
      center: {x: 100, y: 100},
      fromDistance: 40,
      toDistance: 200,
      durationMs: 100,
    });
    const end = spread.at(-2)!.fingers;
    expect(Math.hypot(end[1].x - end[0].x, end[1].y - end[0].y)).toBeCloseTo(
      200,
      6,
    );
    const turn = rotate({
      center: {x: 0, y: 0},
      distance: 100,
      fromAngle: 0,
      toAngle: 90,
      durationMs: 100,
    });
    expect(turn.at(-2)!.fingers[1].x).toBeCloseTo(0, 6);
    expect(turn.at(-2)!.fingers[1].y).toBeCloseTo(50, 6);
    expect(toTouchEvents(spread)[0]).toMatchObject({
      type: 'touchStart',
      changed: [{id: 0}, {id: 1}],
    });
  });

  it('merge lands a second finger mid-drag and lifts it first', () => {
    const first = drag({x: 0, y: 0}, {x: 0, y: 90}, {durationMs: 300, hz: 10});
    const second = withFinger(tap({x: 50, y: 50}, {holdMs: 100}), 1, 120);
    const events = toTouchEvents(merge(first, second));
    const starts = events.filter(e => e.type === 'touchStart');
    expect(
      starts.map(e => [e.t, e.changed.map(f => f.id), e.fingers.length]),
    ).toEqual([
      [0, [0], 1],
      [120, [1], 2],
    ]);
    const ends = events.filter(e => e.type === 'touchEnd');
    expect(ends[0]).toMatchObject({t: 220, changed: [{id: 1}]});
    expect(ends[0].fingers.map(f => f.id)).toEqual([0]);
    expect(ends.at(-1)!.fingers).toEqual([]);
    expect(() => merge(first, first)).toThrow(/two scripts/);
  });

  it('path follows any curve; holdThenDrag holds before the first move', () => {
    const arc = path(
      p => ({x: 100 * Math.cos(p * Math.PI), y: 100 * Math.sin(p * Math.PI)}),
      {durationMs: 100, hz: 40},
    );
    const last = arc.at(-2)!.fingers[0];
    expect(last.x).toBeCloseTo(-100, 6);
    expect(last.y).toBeCloseTo(0, 6);
    expect(arc.at(-1)!.fingers).toEqual([]);
    const held = holdThenDrag(
      {x: 0, y: 0},
      {x: 30, y: 0},
      {durationMs: 50, hz: 20, holdMs: 500},
    );
    const moves = toTouchEvents(held).filter(e => e.type === 'touchMove');
    expect(moves[0].t).toBeCloseTo(550, 6);
    expect(moves.at(-1)!.fingers[0].x).toBeCloseTo(30, 6);
  });

  it('refuses a script that leaves a finger down', () => {
    expect(() =>
      toTouchEvents([{t: 0, fingers: [{id: 0, x: 0, y: 0}]}]),
    ).toThrow(/lifted/);
  });
});
