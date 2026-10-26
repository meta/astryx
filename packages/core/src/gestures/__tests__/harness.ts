// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.ts
 * @input Nothing
 * @output Exports the synthetic-input harness the gesture tests share: a
 *   manual clock, an arena wired to a transition log, and fingers that land,
 *   move and lift at explicit timestamps
 * @position Test-only helper of packages/core/src/gestures (excluded from the
 *   build with the rest of __tests__)
 */

import {GestureArena, type GestureClock} from '../GestureArena';
import type {GestureRecognizer} from '../GestureRecognizer';
import type {
  GestureEnvironment,
  GestureTouch,
  NativeScrollProbe,
  TouchConsumer,
} from '../types';

/** A clock that only moves when the test says so. */
export class ManualClock implements GestureClock {
  time = 0;
  now(): number {
    return this.time;
  }
  setTimeout(): number {
    return 0;
  }
  clearTimeout(): void {}
}

export interface Harness {
  arena: GestureArena;
  clock: ManualClock;
  /** `name:state` for every transition, in order, with its time. */
  log: string[];
  /** Touch ids claimed from the browser, in order. */
  claims: number[];
  /** Deferred clicks as they resolved. */
  deferredClicks: {id: number; allowed: boolean; time: number}[];
  environment: {width: number; height: number; rtl: boolean};
  finger(id: number): Finger;
  /** Advance the clock and run every timer due by `time`. */
  advance(time: number): void;
}

export function createHarness(): Harness {
  const clock = new ManualClock();
  const log: string[] = [];
  const claims: number[] = [];
  const deferredClicks: Harness['deferredClicks'] = [];
  const environment = {width: 390, height: 844, rtl: false};
  const fingers = new Map<number, Finger>();
  const env: GestureEnvironment = {
    viewportSize: () => ({
      width: environment.width,
      height: environment.height,
    }),
    isRtl: () => environment.rtl,
  };
  const arena: GestureArena = new GestureArena({
    clock,
    environment: env,
    onTransition: (recognizer, _from, to) => {
      log.push(`${recognizer.name}:${to}@${round(arena.now())}`);
    },
    onClaim: ids => claims.push(...ids),
    onDeferredClick: (touch, allowed) =>
      deferredClicks.push({id: touch.id, allowed, time: arena.now()}),
  });
  const harness: Harness = {
    arena,
    clock,
    log,
    claims,
    deferredClicks,
    environment,
    finger: id => {
      let finger = fingers.get(id);
      if (finger == null) {
        finger = new Finger(harness, id);
        fingers.set(id, finger);
      }
      return finger;
    },
    advance: time => {
      clock.time = time;
      arena.advanceTime(time);
    },
  };
  return harness;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DownOptions {
  recognizers: ReadonlyArray<GestureRecognizer>;
  consumer?: TouchConsumer | null;
  scroll?: NativeScrollProbe | null;
  pointerType?: 'touch' | 'mouse' | 'pen';
  target?: unknown;
}

/** One contact, driven with explicit timestamps. */
export class Finger {
  x = 0;
  y = 0;
  time = 0;
  constructor(
    private readonly harness: Harness,
    readonly id: number,
  ) {}

  down(x: number, y: number, time: number, options: DownOptions): this {
    this.x = x;
    this.y = y;
    this.time = time;
    this.harness.clock.time = time;
    this.harness.arena.began([
      {
        id: this.id,
        x,
        y,
        time,
        pointerType: options.pointerType ?? 'touch',
        target: options.target ?? null,
        scroll: options.scroll ?? null,
        recognizers: options.recognizers,
        consumer: options.consumer ?? null,
      },
    ]);
    return this;
  }

  move(x: number, y: number, time: number): this {
    this.x = x;
    this.y = y;
    this.time = time;
    this.harness.clock.time = time;
    this.harness.arena.moved([{id: this.id, x, y, time}]);
    return this;
  }

  /** Move in `steps` equal steps over `duration` ms. */
  drag(dx: number, dy: number, duration: number, steps = 8): this {
    const x0 = this.x;
    const y0 = this.y;
    const t0 = this.time;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      this.move(x0 + dx * k, y0 + dy * k, t0 + duration * k);
    }
    return this;
  }

  up(time: number, x = this.x, y = this.y) {
    this.time = time;
    this.harness.clock.time = time;
    return this.harness.arena.ended([{id: this.id, x, y, time}]).get(this.id);
  }

  cancel(time: number): void {
    this.harness.clock.time = time;
    this.harness.arena.cancelled([this.id], time);
  }

  takenByBrowser(time: number): void {
    this.harness.clock.time = time;
    this.harness.arena.browserTookOver([this.id], time);
  }
}

/** A consumer that records what the arena delivered to it. */
export class RecordingConsumer implements TouchConsumer {
  events: string[] = [];
  veto: ((recognizer: unknown) => boolean) | null = null;
  touchBegan(touch: GestureTouch): void {
    this.events.push(`began:${touch.id}`);
  }
  touchMoved(touch: GestureTouch): void {
    this.events.push(`moved:${touch.id}`);
  }
  touchEnded(touch: GestureTouch): void {
    this.events.push(`ended:${touch.id}`);
  }
  touchCancelled(touch: GestureTouch): void {
    this.events.push(`cancelled:${touch.id}`);
  }
  allowsAncestorRecognizer(recognizer: unknown): boolean {
    return this.veto == null ? true : !this.veto(recognizer);
  }
}

/** A scroll probe with a scripted answer. */
export function scrollProbe(
  canScroll: (dx: number, dy: number) => boolean,
  isInsideScroller = true,
): NativeScrollProbe {
  return {canScroll, isInsideScroller, allowsNativePan: true};
}
