// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scripts.ts
 * @input Nothing: pure functions
 * @output Touch scripts — timed lists of the fingers that are down — and the
 *   builders that make them: `tap`, `drag`, `flick`, `holdThenDrag`, `pinch`,
 *   `rotate`, `path`, `withFinger`, `merge`, plus `toTouchEvents`, which turns
 *   a script into the per-event sequence a touch driver dispatches.
 * @position The input half of every interaction proof. A script is data, so a
 *   test states exactly what the finger does — positions and timestamps — and
 *   a unit test can check a builder without a browser.
 *
 * A script is a list of frames ordered by time. Each frame lists every finger
 * that is down at that moment; a finger missing from a frame has lifted. The
 * last frame is always empty (every finger up). Times are milliseconds from
 * the gesture's start; coordinates are CSS px in the viewport.
 *
 * SYNC: Keep ./scripts.test.ts covering every builder.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Finger extends Point {
  /** Stable per finger for the whole gesture. */
  readonly id: number;
}

export interface TouchFrame {
  /** Milliseconds from the start of the gesture. */
  readonly t: number;
  /** Every finger that is down at `t`. Empty = all lifted. */
  readonly fingers: readonly Finger[];
}

export type TouchScript = readonly TouchFrame[];

/** One dispatchable event: what changed at `t`, and the fingers down after it. */
export interface TouchEventStep {
  readonly t: number;
  readonly type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';
  /** Fingers down after this event (CDP semantics: the full active set). */
  readonly fingers: readonly Finger[];
  /** Fingers this event pressed, moved or released. */
  readonly changed: readonly Finger[];
}

const DEFAULT_HZ = 60;

function frameTimes(durationMs: number, hz: number): number[] {
  const step = 1000 / hz;
  const count = Math.max(1, Math.round(durationMs / step));
  return Array.from(
    {length: count},
    (_, i) => +(((i + 1) * durationMs) / count).toFixed(3),
  );
}

function lerp(a: Point, b: Point, p: number): Point {
  return {x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p};
}

/** A press and lift in place. */
export function tap(
  at: Point,
  {holdMs = 60, id = 0}: {holdMs?: number; id?: number} = {},
): TouchScript {
  return [
    {t: 0, fingers: [{id, ...at}]},
    {t: holdMs, fingers: []},
  ];
}

export interface DragOptions {
  /** Time from the first move to the last, ms. */
  readonly durationMs: number;
  /** Move samples per second (iOS reports touches at 60 Hz, 120 Hz on ProMotion). */
  readonly hz?: number;
  /** Rest before the first move (press-and-hold), ms. */
  readonly holdMs?: number;
  /** Rest after the last move before the lift, ms: >= 100 makes the release velocity 0. */
  readonly restMs?: number;
  /** Progress easing over the move, default linear (constant velocity). */
  readonly easing?: (progress: number) => number;
  readonly id?: number;
}

/** Press at `from`, move to `to`, lift. Constant velocity unless `easing` says otherwise. */
export function drag(
  from: Point,
  to: Point,
  options: DragOptions,
): TouchScript {
  const {
    durationMs,
    hz = DEFAULT_HZ,
    holdMs = 0,
    restMs = 0,
    easing = (p: number) => p,
    id = 0,
  } = options;
  const frames: TouchFrame[] = [{t: 0, fingers: [{id, ...from}]}];
  for (const t of frameTimes(durationMs, hz)) {
    frames.push({
      t: holdMs + t,
      fingers: [{id, ...lerp(from, to, easing(t / durationMs))}],
    });
  }
  // A real finger reports no move while it rests: the lift simply comes later.
  const last = frames[frames.length - 1].t;
  frames.push({t: last + Math.max(restMs, 1000 / hz / 4), fingers: []});
  return frames;
}

/** `drag` after a press-and-hold (a long press that turns into a drag). */
export function holdThenDrag(
  from: Point,
  to: Point,
  options: DragOptions & {readonly holdMs: number},
): TouchScript {
  return drag(from, to, options);
}

export interface FlickOptions {
  /** Velocity at the lift, px/s. */
  readonly velocity: Point;
  /** How long the finger moves before the lift, ms. */
  readonly durationMs?: number;
  readonly hz?: number;
  /**
   * Velocity over the move as a fraction of `velocity` (0..1 → 0..∞), default
   * constant. `p => p` is a finger accelerating linearly into the lift. The
   * moves before the last follow it (midpoint rule); the last move runs at
   * `profile(1)`.
   */
  readonly profile?: (progress: number) => number;
  readonly id?: number;
}

/**
 * A throw: the finger moves with the given velocity profile and lifts while
 * still moving (the lift lands a quarter frame after the last move, as on a
 * device). Its last move runs at `velocity` times `profile(1)`, so with any
 * profile that ends at 1 the last move, which is what `releaseVelocity`
 * reads, runs at exactly `velocity`. A tracker that blends recent intervals
 * (a Core component's, `architecture:interaction-modality` INV10) reads
 * exactly `velocity` only when the profile is flat over those intervals, as
 * the default constant profile is.
 */
export function flick(from: Point, options: FlickOptions): TouchScript {
  const {
    velocity,
    durationMs = 80,
    hz = 120,
    profile = () => 1,
    id = 0,
  } = options;
  const step = 1000 / hz;
  const frames: TouchFrame[] = [{t: 0, fingers: [{id, ...from}]}];
  let x = from.x;
  let y = from.y;
  let previous = 0;
  const times = frameTimes(durationMs, hz);
  for (const [index, t] of times.entries()) {
    // Integrate the profile over (previous, t] with the midpoint rule; the last
    // move runs at the release velocity itself, so the finger lifts at it.
    const scale =
      index === times.length - 1
        ? profile(1)
        : profile((previous + t) / 2 / durationMs);
    x += (velocity.x * scale * (t - previous)) / 1000;
    y += (velocity.y * scale * (t - previous)) / 1000;
    previous = t;
    frames.push({t, fingers: [{id, x, y}]});
  }
  frames.push({t: previous + step / 4, fingers: []});
  return frames;
}

/** Any single-finger path: `at(progress)` for progress 0..1 over `durationMs`. */
export function path(
  at: (progress: number) => Point,
  {
    durationMs,
    hz = DEFAULT_HZ,
    holdMs = 0,
    restMs = 0,
    id = 0,
  }: Omit<DragOptions, 'easing'>,
): TouchScript {
  const frames: TouchFrame[] = [{t: 0, fingers: [{id, ...at(0)}]}];
  for (const t of frameTimes(durationMs, hz)) {
    frames.push({t: holdMs + t, fingers: [{id, ...at(t / durationMs)}]});
  }
  frames.push({
    t: frames[frames.length - 1].t + Math.max(restMs, 1000 / hz / 4),
    fingers: [],
  });
  return frames;
}

export interface PinchOptions {
  readonly center: Point;
  /** Finger separation at the start and at the end, px. */
  readonly fromDistance: number;
  readonly toDistance: number;
  /** Angle of the line between the fingers, degrees (0 = horizontal). */
  readonly fromAngle?: number;
  readonly toAngle?: number;
  readonly durationMs: number;
  readonly hz?: number;
  readonly restMs?: number;
}

/** Two fingers (ids 0 and 1) pressed together, spread or pinched and turned, lifted together. */
export function pinch(options: PinchOptions): TouchScript {
  const {
    center,
    fromDistance,
    toDistance,
    fromAngle = 0,
    toAngle = fromAngle,
    durationMs,
    hz = DEFAULT_HZ,
    restMs = 0,
  } = options;
  const at = (p: number): Finger[] => {
    const distance = fromDistance + (toDistance - fromDistance) * p;
    const angle = ((fromAngle + (toAngle - fromAngle) * p) * Math.PI) / 180;
    const dx = (Math.cos(angle) * distance) / 2;
    const dy = (Math.sin(angle) * distance) / 2;
    return [
      {id: 0, x: center.x - dx, y: center.y - dy},
      {id: 1, x: center.x + dx, y: center.y + dy},
    ];
  };
  const frames: TouchFrame[] = [{t: 0, fingers: at(0)}];
  for (const t of frameTimes(durationMs, hz)) {
    frames.push({t, fingers: at(t / durationMs)});
  }
  frames.push({t: durationMs + Math.max(restMs, 1000 / hz / 4), fingers: []});
  return frames;
}

/** Two fingers turning around `center` at a fixed separation. */
export function rotate(
  options: Omit<PinchOptions, 'toDistance' | 'fromDistance'> & {
    readonly distance: number;
  },
): TouchScript {
  return pinch({
    ...options,
    fromDistance: options.distance,
    toDistance: options.distance,
  });
}

/** Re-labels a single-finger script's finger, and shifts it in time. */
export function withFinger(
  script: TouchScript,
  id: number,
  delayMs = 0,
): TouchScript {
  return script.map(frame => ({
    t: frame.t + delayMs,
    fingers: frame.fingers.map(f => ({...f, id})),
  }));
}

/**
 * Plays several scripts at once (each with its own finger ids): at every time
 * any of them changes, each finger is where its own script last put it.
 * Used for a second finger that lands mid-gesture.
 */
export function merge(...scripts: TouchScript[]): TouchScript {
  const times = [...new Set(scripts.flatMap(s => s.map(f => f.t)))].sort(
    (a, b) => a - b,
  );
  const stateAt = (script: TouchScript, t: number): readonly Finger[] => {
    let current: readonly Finger[] = [];
    for (const frame of script) {
      if (frame.t > t) {
        break;
      }
      current = frame.fingers;
    }
    return current;
  };
  const owner = new Map<number, number>();
  scripts.forEach((script, index) => {
    for (const frame of script) {
      for (const f of frame.fingers) {
        if ((owner.get(f.id) ?? index) !== index) {
          throw new Error(`merge: finger ${f.id} is used by two scripts`);
        }
        owner.set(f.id, index);
      }
    }
  });
  return times.map(t => ({t, fingers: scripts.flatMap(s => stateAt(s, t))}));
}

/**
 * Turns frames into events: a finger that appears is a `touchStart`, one that
 * disappears a `touchEnd`, one that moved a `touchMove`. A frame that both
 * moves some fingers and lifts others yields the move first, then the lift.
 * Unchanged frames yield nothing (a resting finger reports nothing).
 */
export function toTouchEvents(script: TouchScript): TouchEventStep[] {
  const events: TouchEventStep[] = [];
  let down = new Map<number, Finger>();
  for (const frame of script) {
    const next = new Map(frame.fingers.map(f => [f.id, f]));
    const pressed = frame.fingers.filter(f => !down.has(f.id));
    const released = [...down.values()].filter(f => !next.has(f.id));
    const moved = frame.fingers.filter(f => {
      const before = down.get(f.id);
      return before != null && (before.x !== f.x || before.y !== f.y);
    });
    if (moved.length > 0) {
      const after = [...down.values()].map(f => next.get(f.id) ?? f);
      events.push({
        t: frame.t,
        type: 'touchMove',
        fingers: after,
        changed: moved,
      });
      down = new Map(after.map(f => [f.id, f]));
    }
    if (released.length > 0) {
      const remaining = [...down.values()].filter(f => next.has(f.id));
      events.push({
        t: frame.t,
        type: 'touchEnd',
        fingers: remaining,
        changed: released.map(f => down.get(f.id) ?? f),
      });
      down = new Map(remaining.map(f => [f.id, f]));
    }
    if (pressed.length > 0) {
      const all = [...down.values(), ...pressed];
      events.push({
        t: frame.t,
        type: 'touchStart',
        fingers: all,
        changed: pressed,
      });
      down = new Map(all.map(f => [f.id, f]));
    }
  }
  if (down.size > 0) {
    throw new Error(
      'toTouchEvents: a script must end with every finger lifted',
    );
  }
  return events;
}

/**
 * The velocity (px/s) of finger `id` as it lifts: the slope of its last move,
 * measured from when it reached its previous position (samples that repeat a
 * position, such as frames `merge` inserts for another finger, are not moves:
 * the page sees none there), or zero when it never moved or rested `restMs` or
 * longer before lifting (a finger that rested released nothing in motion).
 */
export function releaseVelocity(
  script: TouchScript,
  id = 0,
  restMs = 100,
): Point {
  const samples = script.flatMap(frame =>
    frame.fingers
      .filter(f => f.id === id)
      .map(f => ({t: frame.t, x: f.x, y: f.y})),
  );
  if (samples.length < 2) {
    return {x: 0, y: 0};
  }
  const lift = script.find(
    frame => frame.t > samples[0].t && !frame.fingers.some(f => f.id === id),
  );
  // The last sample that actually moved: a resting finger reports nothing.
  let lastMove = samples.length - 1;
  while (
    lastMove > 0 &&
    samples[lastMove].x === samples[lastMove - 1].x &&
    samples[lastMove].y === samples[lastMove - 1].y
  ) {
    lastMove -= 1;
  }
  if (lastMove === 0) {
    return {x: 0, y: 0};
  }
  const last = samples[lastMove];
  if (lift != null && lift.t - last.t >= restMs) {
    return {x: 0, y: 0};
  }
  let previous = lastMove - 1;
  while (
    previous > 0 &&
    samples[previous - 1].x === samples[previous].x &&
    samples[previous - 1].y === samples[previous].y
  ) {
    previous -= 1;
  }
  const before = samples[previous];
  const dt = last.t - before.t;
  return dt <= 0
    ? {x: 0, y: 0}
    : {
        x: ((last.x - before.x) / dt) * 1000,
        y: ((last.y - before.y) / dt) * 1000,
      };
}
