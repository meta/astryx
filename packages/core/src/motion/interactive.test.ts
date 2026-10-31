// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file interactive.test.ts
 * @input createInteractiveTransition over a recording animator
 * @output Tests of the interactive-transition driver: one clock for the driver
 *   and its layers, the rule's inputs, grab from the presented values, the
 *   track rule's follow and state layers, and reduced motion's options
 * @position Unit tests of motion/interactive.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  AnimateOptions,
  Animator,
  MotionCurve,
  MotionValues,
  SpringTransition,
} from './animator';
import {
  createInteractiveTransition,
  type ReleaseRule,
  type TrackRule,
} from './interactive';

interface Play {
  curves: Record<string, MotionCurve>;
  options: AnimateOptions;
  finish: (completed: boolean) => void;
}

/** An animator that records its calls and presents its curves on a clock. */
function recordingAnimator(initial: Record<string, number> = {}) {
  const values = new Map(Object.entries(initial));
  const running = new Map<string, {curve: MotionCurve; at: number}>();
  const plays: Play[] = [];
  const animates: {
    to: MotionValues;
    transition: SpringTransition;
    options?: AnimateOptions;
  }[] = [];
  const sets: MotionValues[] = [];
  const handle = (finished: Promise<boolean>) => ({
    properties: [],
    finished,
    started: Promise.resolve(0),
    value: () => 0,
    velocity: () => 0,
    stop: () => {},
  });
  const sample = (property: string, time: number) => {
    const run = running.get(property);
    if (run == null) {
      return {value: values.get(property) ?? 0, velocity: 0};
    }
    const t = Math.min(Math.max(0, (time - run.at) / 1000), run.curve.duration);
    return {value: run.curve.at(t), velocity: run.curve.velocity(t)};
  };
  const animator = {
    element: null,
    get: (property: string, time = performance.now()) =>
      sample(property, time).value,
    getVelocity: (property: string, time = performance.now()) =>
      sample(property, time).velocity,
    set: (next: MotionValues) => {
      sets.push(next);
      for (const [key, value] of Object.entries(next)) {
        running.delete(key);
        values.set(key, value);
      }
    },
    play: (
      curves: Record<string, MotionCurve>,
      options: AnimateOptions = {},
    ) => {
      let finish: (completed: boolean) => void = () => {};
      const finished = new Promise<boolean>(resolve => {
        finish = resolve;
      });
      plays.push({curves, options, finish});
      for (const [key, curve] of Object.entries(curves)) {
        running.set(key, {curve, at: options.at ?? performance.now()});
      }
      return handle(finished);
    },
    animate: (
      to: MotionValues,
      transition: SpringTransition,
      options?: AnimateOptions,
    ) => {
      animates.push({to, transition, options});
      for (const [key, value] of Object.entries(to)) {
        // A spring the test doesn't run: it stays where it was drawn.
        values.set(key, sample(key, performance.now()).value);
        running.delete(key);
        void value;
      }
      return handle(Promise.resolve(true));
    },
  };
  return {animator: animator as unknown as Animator, plays, animates, sets};
}

const SPRING = {mass: 1, stiffness: 300, damping: 30};

/** Lands on the nearer of two detents, 0 and 200, on SPRING; 200 exits. */
const nearest: ReleaseRule<'top' | 'gone', {height: number}> = ({position}) =>
  position < 100
    ? {target: 0, motion: SPRING, outcome: 'top'}
    : {target: 200, motion: SPRING, outcome: 'gone', exits: true};

describe('createInteractiveTransition', () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const flushFrame = () => {
    const pending = frames;
    frames = [];
    for (const callback of pending) {
      callback(performance.now());
    }
  };

  it('plays the driver and every map layer from one progress curve, on one clock', () => {
    const sheet = recordingAnimator({y: 120});
    const scrim = recordingAnimator({opacity: 0.4});
    const dim = (y: number) => 1 - y / 200;
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      layers: [{animator: scrim.animator, property: 'opacity', map: dim}],
      rule: nearest,
    });
    const now = performance.now();
    const run = transition.release(
      {finger: 120, velocity: 300},
      {height: 200},
      now,
    );
    expect(run.outcome).toBe('gone');
    expect(sheet.plays).toHaveLength(1);
    expect(scrim.plays).toHaveLength(1);
    const [drive] = sheet.plays;
    const [follow] = scrim.plays;
    // One explicit `at` for both, and a touch release for both.
    expect(drive.options.at).toBe(now);
    expect(follow.options.at).toBe(now);
    expect(drive.options.touchRelease).toBe(true);
    expect(follow.options.touchRelease).toBe(true);
    // The exit fades out in place on the driver only.
    expect(drive.options.crossfadeAs).toBe('exit');
    expect(follow.options.crossfadeAs).toBeUndefined();
    // The layer is the map of the driver at every time.
    const y = drive.curves.y;
    const opacity = follow.curves.opacity;
    expect(opacity.duration).toBe(y.duration);
    for (const t of [0, 0.05, 0.1, 0.2, y.duration]) {
      expect(opacity.at(t)).toBeCloseTo(dim(y.at(t)), 9);
    }
    expect(y.at(0)).toBeCloseTo(120, 9);
    expect(y.at(y.duration)).toBe(200);
  });

  it('hands the spring the release velocity, in driver units per second', () => {
    const sheet = recordingAnimator({y: 120});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      rule: nearest,
    });
    transition.release({finger: 120, velocity: 450}, {height: 200});
    expect(sheet.plays[0].curves.y.velocity(0)).toBeCloseTo(450, 6);
  });

  it('passes the rule the presented position at the release, the finger and the drag state', () => {
    const sheet = recordingAnimator({y: 40});
    const rule = vi.fn(nearest);
    const transition = createInteractiveTransition<
      'top' | 'gone',
      {height: number}
    >({
      driver: {animator: sheet.animator, property: 'y'},
      rule,
    });
    transition.release({finger: 55, velocity: -20}, {height: 200});
    expect(rule).toHaveBeenCalledWith(
      {position: 40, finger: 55, velocity: -20},
      {height: 200, track: undefined},
    );
  });

  it('uses a capped hand-off velocity when the rule gives one', () => {
    const sheet = recordingAnimator({y: 50});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      rule: () => ({target: 0, motion: SPRING, outcome: 'top', velocity: -100}),
    });
    transition.release({finger: 50, velocity: -900}, {});
    expect(sheet.plays[0].curves.y.velocity(0)).toBeCloseTo(-100, 6);
  });

  it('plays a timed motion along its easing', () => {
    const sheet = recordingAnimator({y: 0});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      rule: nearest,
    });
    const easing = (p: number) => p * p;
    transition.to(100, {durationMs: 400, easing});
    const y = sheet.plays[0].curves.y;
    expect(y.duration).toBeCloseTo(0.4, 9);
    expect(y.at(0.2)).toBeCloseTo(100 * easing(0.5), 9);
    expect(y.at(0.4)).toBe(100);
  });

  it('settles at once when the driver is already at the target', async () => {
    const sheet = recordingAnimator({y: 200});
    const scrim = recordingAnimator({opacity: 0});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      layers: [
        {animator: scrim.animator, property: 'opacity', map: y => 1 - y / 200},
      ],
      rule: nearest,
    });
    const run = transition.release({finger: 200, velocity: 0}, {height: 200});
    expect(run.handle).toBeNull();
    expect(sheet.plays).toHaveLength(0);
    expect(sheet.sets.at(-1)).toEqual({y: 200});
    expect(scrim.sets.at(-1)).toEqual({opacity: 0});
    await expect(run.finished).resolves.toBe(true);
  });

  it('finishes when the driver and every layer have', async () => {
    const sheet = recordingAnimator({y: 120});
    const scrim = recordingAnimator({opacity: 0.4});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      layers: [{animator: scrim.animator, property: 'opacity', map: y => y}],
      rule: nearest,
    });
    const run = transition.release({finger: 120, velocity: 0}, {height: 200});
    let done: boolean | null = null;
    void run.finished.then(value => {
      done = value;
    });
    sheet.plays[0].finish(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBeNull();
    scrim.plays[0].finish(true);
    await run.finished;
    expect(done).toBe(true);
  });

  it('grabs from the presented values, leaving the driver element\u2019s opacity alone', () => {
    const sheet = recordingAnimator({y: 120, opacity: 0.4});
    const scrim = recordingAnimator({opacity: 0.5});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      layers: [
        {animator: scrim.animator, property: 'opacity', map: y => 1 - y / 200},
      ],
      rule: nearest,
    });
    const start = performance.now();
    transition.release({finger: 120, velocity: 0}, {height: 200}, start);
    const t = start + 80;
    const y = sheet.animator.get('y', t);
    const dim = scrim.animator.get('opacity', t);
    expect(transition.grab(t)).toBeCloseTo(y, 9);
    expect(sheet.sets.at(-1)).toEqual({y});
    expect(scrim.sets.at(-1)).toEqual({opacity: dim});
    // The sheet's own opacity (a reduced-motion cross-fade) is not written.
    expect(sheet.sets.some(set => 'opacity' in set)).toBe(false);
  });

  it('writes the driver and its map layers 1:1 without a track rule', () => {
    const sheet = recordingAnimator({y: 0});
    const scrim = recordingAnimator({opacity: 1});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      layers: [
        {animator: scrim.animator, property: 'opacity', map: y => 1 - y / 200},
      ],
      rule: nearest,
    });
    transition.track(50);
    expect(sheet.sets.at(-1)).toEqual({y: 50});
    expect(scrim.sets.at(-1)).toEqual({opacity: 0.75});
    expect(frames).toHaveLength(0);
  });

  describe('a track rule with state', () => {
    interface Swipe {
      isConfirmed: boolean;
      wasConfirmed: boolean;
    }
    const CONFIRM_AT = 100;
    // Confirmed past the confirm point, the row runs ahead on a spring.
    const swipe: TrackRule<Swipe> = (finger, state) => {
      const isConfirmed = finger >= CONFIRM_AT;
      return isConfirmed
        ? {
            position: Math.max(finger, 150),
            state: {isConfirmed, wasConfirmed: true},
            follow: SPRING,
          }
        : {position: finger, state: {...state, isConfirmed}};
    };
    const setup = () => {
      const row = recordingAnimator({x: 0});
      const look = recordingAnimator({scaleX: 0});
      const release = vi.fn<ReleaseRule<'closed' | 'perform', object, Swipe>>(
        (_, {track}) =>
          track.isConfirmed
            ? {target: 300, motion: SPRING, outcome: 'perform', exits: true}
            : {target: 0, motion: SPRING, outcome: 'closed'},
      );
      const transition = createInteractiveTransition<
        'closed' | 'perform',
        object,
        Swipe
      >({
        driver: {animator: row.animator, property: 'x'},
        layers: [
          {
            animator: look.animator,
            property: 'scaleX',
            value: state => (state.isConfirmed ? 1 : 0),
            spring: SPRING,
          },
        ],
        track: {
          rule: swipe,
          initial: {isConfirmed: false, wasConfirmed: false},
        },
        rule: release,
      });
      return {row, look, release, transition};
    };

    it('writes 1:1 until the rule follows, then retargets once a frame', () => {
      const {row, transition} = setup();
      transition.track(40);
      expect(row.sets.at(-1)).toEqual({x: 40});
      transition.track(120);
      transition.track(130);
      transition.track(140);
      // Three moves in one frame: one retarget, to the last target.
      expect(row.animates).toHaveLength(0);
      flushFrame();
      expect(row.animates).toHaveLength(1);
      expect(row.animates[0].to).toEqual({x: 150});
      // No velocity passed: a retarget continues from the presented one.
      expect(row.animates[0].transition).toEqual({spring: SPRING});
    });

    it('springs a state layer on a state change, with the finger still down', () => {
      const {look, transition} = setup();
      transition.track(40);
      expect(look.animates).toHaveLength(0);
      transition.track(120);
      expect(look.animates).toHaveLength(1);
      expect(look.animates[0].to).toEqual({scaleX: 1});
      expect(look.animates[0].options?.touchRelease).toBe(false);
      transition.track(125);
      expect(look.animates).toHaveLength(1);
    });

    it('keeps following after a back-out until the driver catches up, then writes 1:1', () => {
      const {row, transition} = setup();
      transition.track(120);
      flushFrame();
      const springs = row.animates.length;
      // Backed out: the target is the finger again, but the row still lags.
      row.animator.set({x: 140});
      transition.track(60);
      flushFrame();
      expect(row.animates.length).toBe(springs + 1);
      expect(row.animates.at(-1)?.to).toEqual({x: 60});
      // Caught up within 0.5 px: one write, and no more springs.
      row.animator.set({x: 60.3});
      flushFrame();
      expect(row.sets.at(-1)).toEqual({x: 60});
      expect(row.animates.length).toBe(springs + 1);
      expect(frames).toHaveLength(0);
    });

    it('hands the release rule the state at the lift, and a grab starts it over', () => {
      const {release, transition} = setup();
      transition.track(120);
      flushFrame();
      transition.release({finger: 120, velocity: 0}, {});
      expect(release.mock.calls[0][1].track).toEqual({
        isConfirmed: true,
        wasConfirmed: true,
      });
      transition.grab();
      expect(transition.state).toEqual({
        isConfirmed: false,
        wasConfirmed: false,
      });
    });
  });
});

describe('createInteractiveTransition: a move from rest', () => {
  it('starts the driver and its layers on the browser\u2019s commit when asked', () => {
    const sheet = recordingAnimator({y: 300});
    const scrim = recordingAnimator({opacity: 0});
    const transition = createInteractiveTransition({
      driver: {animator: sheet.animator, property: 'y'},
      layers: [
        {animator: scrim.animator, property: 'opacity', map: y => 1 - y / 300},
      ],
      rule: nearest,
    });
    transition.to(0, SPRING, {crossfadeAs: 'entrance', startAtCommit: true});
    expect(sheet.plays[0].options.at).toBeUndefined();
    expect(scrim.plays[0].options.at).toBeUndefined();
    expect(sheet.plays[0].options.crossfadeAs).toBe('entrance');
    expect(scrim.plays[0].options.crossfadeAs).toBeUndefined();
  });
});
