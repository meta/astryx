// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motion.ts
 * @input DOM elements and pointer events from this post's demos.
 * @output Small motion helpers: a spring animator, a release-velocity tracker,
 *   a pointer gesture recognizer, a rubber band, a layout glide and the
 *   Reduce Motion check.
 * @position Post-local example code for the motion-and-gestures blog post.
 *   It is not an Astryx API and no package exports it. Each helper stands in
 *   for a public factory that is not released yet.
 */

/** A spring, in the response and damping terms Astryx motion uses. */
export interface Spring {
  /** Seconds the spring takes to settle, roughly. */
  response: number;
  /** 1 is critically damped. Less than 1 overshoots. */
  damping: number;
}

export const springs = {
  glide: {response: 0.42, damping: 0.86},
  snappy: {response: 0.3, damping: 0.92},
  toss: {response: 0.6, damping: 0.68},
  lift: {response: 0.22, damping: 1},
  flip: {response: 0.42, damping: 1},
} satisfies Record<string, Spring>;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Past an edge, movement follows the finger less and less, like a rubber band.
 * Stands in for the edge resistance of the public pan factory.
 */
export function rubberBand(
  value: number,
  min: number,
  max: number,
  dimension = 120,
): number {
  const band = (overshoot: number) =>
    (overshoot * dimension * 0.55) / (dimension + 0.55 * overshoot);
  if (value < min) {
    return min - band(min - value);
  }
  if (value > max) {
    return max + band(value - max);
  }
  return value;
}

type Channels = Record<string, number>;

const running = new Set<SpringAnimator<Channels>>();
let frame = 0;
let lastTime = 0;

function tick(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 1 / 60);
  lastTime = now;
  for (const animator of [...running]) {
    animator.step(dt);
  }
  frame = running.size > 0 ? requestAnimationFrame(tick) : 0;
}

function schedule(animator: SpringAnimator<Channels>) {
  running.add(animator);
  if (frame === 0) {
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

// How close to rest a channel must be to stop, in its own unit.
const SETTLE_DISTANCE: Record<string, number> = {scale: 0.001, rotate: 0.1};
const DEFAULT_SETTLE_DISTANCE = 0.3;

/**
 * Animates named numeric channels with springs and calls `render` every
 * frame. A new target retargets from the current value and velocity, so a
 * motion can change its destination mid-glide without a jump.
 * Stands in for the public animator factory.
 */
export class SpringAnimator<T extends Channels> {
  readonly value: T;
  private readonly velocity: Channels = {};
  private target: Partial<T> = {};
  private spring: Spring = springs.glide;
  private settled: Array<() => void> = [];

  constructor(
    initial: T,
    private readonly render: (value: T) => void,
  ) {
    this.value = {...initial};
    for (const key of Object.keys(initial)) {
      this.velocity[key] = 0;
    }
    render(this.value);
  }

  /** Jumps to the values with no motion. */
  set(values: Partial<T>): void {
    this.stop();
    Object.assign(this.value, values);
    for (const key of Object.keys(values)) {
      this.velocity[key] = 0;
    }
    this.render(this.value);
  }

  /**
   * Springs to the target. `velocity` carries a finger's release speed into
   * the motion. With Reduce Motion, the values change at once.
   */
  to(
    target: Partial<T>,
    options: {spring?: Spring; velocity?: Partial<T>} = {},
  ): Promise<void> {
    if (prefersReducedMotion()) {
      this.set(target);
      return Promise.resolve();
    }
    this.spring = options.spring ?? springs.glide;
    Object.assign(this.target, target);
    for (const [key, speed] of Object.entries(options.velocity ?? {})) {
      this.velocity[key] = speed as number;
    }
    schedule(this as unknown as SpringAnimator<Channels>);
    return new Promise(resolve => this.settled.push(resolve));
  }

  stop(): void {
    this.target = {};
    running.delete(this as unknown as SpringAnimator<Channels>);
    this.resolveSettled();
  }

  /** @internal Advances the springs by `dt` seconds. */
  step(dt: number): void {
    const {response, damping} = this.spring;
    const stiffness = (2 * Math.PI) / response;
    const k = stiffness * stiffness;
    const c = (4 * Math.PI * damping) / response;
    const substeps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / substeps;
    let isDone = true;
    const value = this.value as Channels;
    for (const [key, goal] of Object.entries(this.target)) {
      if (goal == null) {
        continue;
      }
      for (let i = 0; i < substeps; i++) {
        const acceleration = -k * (value[key] - goal) - c * this.velocity[key];
        this.velocity[key] += acceleration * h;
        value[key] += this.velocity[key] * h;
      }
      const settle = SETTLE_DISTANCE[key] ?? DEFAULT_SETTLE_DISTANCE;
      if (
        Math.abs(value[key] - goal) < settle &&
        Math.abs(this.velocity[key]) < settle * 20
      ) {
        value[key] = goal;
        this.velocity[key] = 0;
        delete this.target[key];
      } else {
        isDone = false;
      }
    }
    this.render(this.value);
    if (isDone) {
      running.delete(this as unknown as SpringAnimator<Channels>);
      this.resolveSettled();
    }
  }

  private resolveSettled() {
    const settled = this.settled;
    this.settled = [];
    settled.forEach(resolve => resolve());
  }
}

export interface Placement extends Channels {
  x: number;
  y: number;
  rotate: number;
  scale: number;
}

/** A spring animator that writes translate, rotate and scale on an element. */
export function placementAnimator(
  element: HTMLElement,
  initial: Partial<Placement> = {},
): SpringAnimator<Placement> {
  return new SpringAnimator<Placement>(
    {x: 0, y: 0, rotate: 0, scale: 1, ...initial},
    ({x, y, rotate, scale}) => {
      element.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`;
    },
  );
}

/**
 * Release velocity in pixels per second. A finger that rested for 60 ms
 * before it lifted releases at zero, so a careful drop never flings.
 */
export class VelocityTracker {
  private samples: Array<{t: number; x: number; y: number}> = [];

  add(x: number, y: number): void {
    const t = performance.now();
    this.samples.push({t, x, y});
    while (this.samples.length > 2 && t - this.samples[0].t > 100) {
      this.samples.shift();
    }
  }

  velocity(): {x: number; y: number} {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (this.samples.length < 2 || performance.now() - last.t > 60) {
      return {x: 0, y: 0};
    }
    const dt = Math.max(0.008, (last.t - first.t) / 1000);
    return {x: (last.x - first.x) / dt, y: (last.y - first.y) / dt};
  }
}

export interface PanState {
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Release velocity, set when the gesture ends. */
  vx: number;
  vy: number;
  /** The live velocity while the finger moves. */
  tracker: VelocityTracker;
  isCancelled: boolean;
}

export interface PanHandlers {
  onPress?: (state: PanState) => void;
  onRelease?: (state: PanState) => void;
  onTap?: (state: PanState) => void;
  onDragStart?: (state: PanState) => void;
  onDragMove?: (state: PanState) => void;
  onDragEnd?: (state: PanState) => void;
}

/**
 * Recognizes press, tap and drag on one element with pointer events, so mouse,
 * pen and touch share one path. A drag starts after the pointer travels
 * `slop` pixels. Escape cancels a drag in progress. Returns a cleanup.
 * Stands in for the public pan factory.
 */
export function attachPan(
  element: HTMLElement,
  handlers: PanHandlers,
  {slop = 6}: {slop?: number} = {},
): () => void {
  let state: (PanState & {id: number; isDragging: boolean}) | null = null;

  const finish = (isCancelled: boolean) => {
    if (state == null) {
      return;
    }
    const ended = state;
    state = null;
    const {x, y} = ended.tracker.velocity();
    ended.vx = isCancelled ? 0 : x;
    ended.vy = isCancelled ? 0 : y;
    ended.isCancelled = isCancelled;
    handlers.onRelease?.(ended);
    if (ended.isDragging) {
      handlers.onDragEnd?.(ended);
    } else if (!isCancelled) {
      handlers.onTap?.(ended);
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || state != null) {
      return;
    }
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic or already-released pointer cannot be captured.
    }
    state = {
      id: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      tracker: new VelocityTracker(),
      isCancelled: false,
      isDragging: false,
    };
    state.tracker.add(event.clientX, event.clientY);
    handlers.onPress?.(state);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (state == null || event.pointerId !== state.id) {
      return;
    }
    state.x = event.clientX;
    state.y = event.clientY;
    state.dx = state.x - state.startX;
    state.dy = state.y - state.startY;
    state.tracker.add(state.x, state.y);
    if (!state.isDragging && Math.hypot(state.dx, state.dy) > slop) {
      state.isDragging = true;
      handlers.onDragStart?.(state);
    }
    if (state.isDragging) {
      handlers.onDragMove?.(state);
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (state != null && event.pointerId === state.id) {
      finish(false);
    }
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (state != null && event.pointerId === state.id) {
      finish(true);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (state != null && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    }
  };
  // The browser's own image and text drag would steal the pointer.
  const onNativeDragStart = (event: Event) => event.preventDefault();

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('dragstart', onNativeDragStart);
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('dragstart', onNativeDragStart);
    window.removeEventListener('keydown', onKeyDown, true);
  };
}

/**
 * Records where elements are, so that after the DOM changes each one can
 * glide from its old place to its new one. Call `capture` before a change and
 * `play` after it renders. `from` replaces one element's old place, for
 * example with where a dragged copy of it is now.
 * Stands in for the layout glide of the public reorder factory.
 */
export class LayoutGlide {
  private before = new Map<string, DOMRect>();
  private readonly animators = new WeakMap<
    HTMLElement,
    SpringAnimator<Placement>
  >();

  capture(
    elements: Map<string, HTMLElement>,
    from?: {key: string; rect: DOMRect},
  ): void {
    this.before = new Map();
    for (const [key, element] of elements) {
      this.before.set(key, element.getBoundingClientRect());
    }
    if (from != null) {
      this.before.set(from.key, from.rect);
    }
  }

  play(
    elements: Map<string, HTMLElement>,
    velocity?: {key: string; x: number; y: number},
  ): void {
    const before = this.before;
    this.before = new Map();
    for (const [key, element] of elements) {
      const old = before.get(key);
      if (old == null) {
        continue;
      }
      const animator = this.animatorFor(element);
      const now = element.getBoundingClientRect();
      // `now` includes the running offset. Remove it to get the resting place.
      const dx = old.left - (now.left - animator.value.x);
      const dy = old.top - (now.top - animator.value.y);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        continue;
      }
      animator.set({x: dx, y: dy, rotate: 0, scale: 1});
      const speed =
        velocity?.key === key ? {x: velocity.x, y: velocity.y} : undefined;
      void animator.to({x: 0, y: 0}, {velocity: speed});
    }
  }

  private animatorFor(element: HTMLElement): SpringAnimator<Placement> {
    let animator = this.animators.get(element);
    if (animator == null) {
      animator = placementAnimator(element);
      this.animators.set(element, animator);
    }
    return animator;
  }
}
