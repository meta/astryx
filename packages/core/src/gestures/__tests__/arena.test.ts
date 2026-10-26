// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file arena.test.ts
 * @input GestureArena with scripted recognizers (test doubles that begin,
 *   change, end, fail or wait on command) and recording consumers, driven by
 *   synthetic touches with explicit timestamps
 * @output The arena's own rules, independent of any real recognizer:
 *   exclusivity, simultaneity, require-to-fail (waiting, failing, delegate
 *   requirements, idle recognizers), shouldBegin and shouldReceiveTouch,
 *   innermost resolution, independent touches, delivery to the view (claims,
 *   cancelsTouchesInView, delaysTouchesBegan, deferred and replayed clicks,
 *   the browser taking a touch), cancellation, and the event clock
 * @position Unit tests of packages/core/src/gestures/GestureArena.ts and the
 *   state machine of GestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {
  GestureRecognizer,
  isActive,
  type GestureRecognizerOptions,
} from '../GestureRecognizer';
import type {GestureEventContext, GestureTouch} from '../types';
import {GestureArena, type GestureClock} from '../GestureArena';
import {createHarness, RecordingConsumer} from './harness';

type Step = (recognizer: Scripted, event: GestureEventContext) => void;

interface Script {
  began?: Step;
  moved?: Step;
  ended?: Step;
}

/**
 * A recognizer that does what its script says on each touch event, and what
 * the test asks between them. Without a script for the lift, an active
 * gesture ends with its last touch and a possible one fails.
 */
class Scripted extends GestureRecognizer {
  /** Expects more input after its touches lifted (a multi-tap between taps). */
  isWaiting = false;
  private readonly discrete: boolean;
  private readonly script: Script;

  constructor(
    name: string,
    script: Script = {},
    options: GestureRecognizerOptions<Scripted> & {discrete?: boolean} = {},
  ) {
    super({...options, name});
    this.discrete = options.discrete ?? false;
    this.script = script;
  }

  override get isDiscrete(): boolean {
    return this.discrete;
  }

  override isInvolved(): boolean {
    return super.isInvolved() || this.isWaiting;
  }

  recognize(): void {
    this.setState(this.discrete ? 'ended' : 'began');
  }

  change(): void {
    this.setState('changed');
  }

  fail(): void {
    this.isWaiting = false;
    this.setState('failed');
  }

  /** Recognize at `deadline` on the event clock, unless the touch lifts. */
  recognizeAt(deadline: number): void {
    this.setTimer(deadline, () => this.recognize());
  }

  /** Wait for more input until `deadline` on the event clock, then fail. */
  waitUntil(deadline: number): void {
    this.isWaiting = true;
    this.setTimer(deadline, () => this.fail());
  }

  protected override touchesBegan(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    this.script.began?.(this, event);
  }

  protected override touchesMoved(
    _touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.script.moved != null) {
      this.script.moved(this, event);
    } else if (isActive(this.state)) {
      this.change();
    }
  }

  protected override touchesEnded(
    touches: ReadonlyArray<GestureTouch>,
    event: GestureEventContext,
  ): void {
    if (this.script.ended != null) {
      this.script.ended(this, event);
      return;
    }
    if (this.numberOfTouches - touches.length > 0) {
      return;
    }
    if (isActive(this.state)) {
      this.setState('ended');
    } else if (this.state === 'possible') {
      this.fail();
    }
  }

  protected override reset(): void {
    this.isWaiting = false;
  }
}

/** Recognizes on the first move. */
const onMove: Script = {
  moved: r => (r.state === 'possible' ? r.recognize() : r.change()),
};

/** A discrete recognizer that recognizes at the lift. */
const atLift = (name: string, options = {}) =>
  new Scripted(name, {ended: r => r.recognize()}, {discrete: true, ...options});

/** Waits after the lift until `deadline`, as a double tap between taps does. */
const waitsAfterLift = (name: string, deadline: number) =>
  new Scripted(name, {ended: r => r.waitUntil(deadline)}, {discrete: true});

describe('arena: who wins', () => {
  it('is exclusive by default: the first to recognize fails the others', () => {
    const h = createHarness();
    const a = new Scripted('a', onMove);
    const b = new Scripted('b');
    h.finger(1)
      .down(0, 0, 0, {recognizers: [a, b]})
      .move(5, 0, 16);
    expect(h.log).toEqual(['a:began@16', 'b:failed@16']);
    expect(h.claims).toEqual([1]);
  });

  it('lets two recognize together only when allowed', () => {
    const h = createHarness();
    const a = new Scripted('a', onMove);
    const b = new Scripted('b', onMove);
    a.recognizeSimultaneouslyWith(b);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [a, b]})
      .move(5, 0, 16);
    expect(h.log).toEqual(['a:began@16', 'b:began@16']);
  });

  it('holds a recognizer that requires another to fail until it fails', () => {
    const h = createHarness();
    const single = atLift('single');
    const double = waitsAfterLift('double', 400);
    single.requireToFail(double);
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    h.finger(1).up(50);
    expect(single.state).toBe('possible');
    expect(single.pending).toBe('ended');
    h.advance(400);
    expect(h.log).toEqual([
      'double:failed@400',
      'single:ended@400',
      'single:possible@400',
      'double:possible@400',
    ]);
  });

  it('fails the waiting recognizer when the required one recognizes', () => {
    const h = createHarness();
    const single = atLift('single');
    const double = new Scripted('double', {}, {discrete: true});
    single.requireToFail(double);
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    double.recognize();
    expect(h.log).toEqual(['double:ended@0', 'single:failed@0']);
  });

  it('is not held up by a required recognizer that is not involved', () => {
    const h = createHarness();
    const idle = new Scripted('idle');
    const tap = atLift('tap');
    tap.requireToFail(idle);
    h.finger(1).down(0, 0, 0, {recognizers: [tap]});
    h.finger(1).up(50);
    expect(h.log[0]).toBe('tap:ended@50');
  });

  it('honors failure requirements from the delegate', () => {
    const h = createHarness();
    const double = waitsAfterLift('double', 400);
    const single = atLift('single', {
      shouldRequireFailureOf: (_self: Scripted, other: GestureRecognizer) =>
        other === double,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    h.finger(1).up(50);
    expect(single.pending).toBe('ended');
  });

  it('honors shouldBegin and shouldReceiveTouch', () => {
    const h = createHarness();
    const refused = new Scripted('refused', onMove, {
      shouldBegin: () => false,
    });
    const blind = new Scripted('blind', {}, {shouldReceiveTouch: () => false});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [refused, blind]})
      .move(5, 0, 16);
    expect(h.log).toEqual(['refused:failed@16']);
    expect(blind.numberOfTouches).toBe(0);
  });

  it('gives a tie on the same event to the innermost recognizer', () => {
    const h = createHarness();
    const inner = new Scripted('inner', onMove);
    const outer = new Scripted('outer', onMove);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [inner, outer]})
      .move(5, 0, 16);
    expect(h.log).toEqual(['inner:began@16', 'outer:failed@16']);
  });

  it('lets fingers on unrelated views drive their own recognizers', () => {
    const h = createHarness();
    const left = new Scripted('left', onMove);
    const right = new Scripted('right', onMove);
    h.finger(1).down(0, 0, 0, {recognizers: [left]});
    h.finger(2).down(300, 0, 0, {recognizers: [right]});
    h.finger(1).move(5, 0, 16);
    h.finger(2).move(305, 0, 16);
    expect(left.state).toBe('began');
    expect(right.state).toBe('began');
  });
});

describe('arena: delivery to the view', () => {
  it('delivers an unclaimed touch and allows its click', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const r = new Scripted('r');
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    finger.move(3, 0, 16);
    expect(finger.up(60)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'moved:1', 'ended:1']);
  });

  it('cancels the view and swallows the click once a recognizer takes the touch', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const r = new Scripted('r', onMove);
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    finger.move(5, 0, 16);
    expect(consumer.events).toEqual(['began:1', 'cancelled:1']);
    expect(finger.up(60)).toBe('suppress');
  });

  it('keeps the view and the click with cancelsTouchesInView off', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const r = new Scripted('r', onMove, {cancelsTouchesInView: false});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    finger.move(5, 0, 16);
    expect(finger.up(60)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'moved:1', 'ended:1']);
  });

  it('holds the view until the recognizer fails with delaysTouchesBegan', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const r = new Scripted(
      'r',
      {began: (self, event) => self.waitUntil(event.time + 100)},
      {delaysTouchesBegan: true},
    );
    h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    expect(consumer.events).toEqual([]);
    h.advance(100);
    expect(consumer.events).toEqual(['began:1']);
  });

  it('defers the click a waiting recognizer may still claim, then replays it', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const double = waitsAfterLift('double', 400);
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [double], consumer});
    expect(finger.up(70)).toBe('defer');
    expect(consumer.events).toEqual(['began:1']);
    h.advance(400);
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
    expect(h.deferredClicks).toEqual([{id: 1, allowed: true, time: 400}]);
  });

  it('drops the deferred click when the waiting recognizer recognizes', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    let lifts = 0;
    // Waits after the first lift, recognizes at the second.
    const double = new Scripted(
      'double',
      {ended: r => (lifts++ === 0 ? r.waitUntil(400) : r.recognize())},
      {discrete: true},
    );
    h.finger(1).down(0, 0, 0, {recognizers: [double], consumer});
    h.finger(1).up(70);
    h.finger(2).down(1, 1, 150, {recognizers: [double], consumer});
    expect(h.finger(2).up(210)).toBe('suppress');
    expect(h.deferredClicks).toEqual([{id: 1, allowed: false, time: 210}]);
    expect(consumer.events).toEqual([
      'began:1',
      'began:2',
      'cancelled:1',
      'cancelled:2',
    ]);
  });

  it('fails a possible recognizer and cancels the view when the browser takes the touch', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const r = new Scripted('r');
    h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    h.finger(1).takenByBrowser(30);
    expect(consumer.events).toEqual(['began:1', 'cancelled:1']);
    expect(h.log).toEqual(['r:failed@30', 'r:possible@30']);
  });
});

describe('arena: cancellation and time', () => {
  it('cancels an active gesture and fails a possible one on a system cancel', () => {
    const h = createHarness();
    const active = new Scripted('active', onMove);
    const waiting = new Scripted('waiting');
    h.finger(1)
      .down(0, 0, 0, {recognizers: [active]})
      .move(5, 0, 16);
    h.finger(2).down(100, 0, 20, {recognizers: [waiting]});
    h.arena.cancelled([1, 2], 50);
    expect(h.log).toEqual([
      'active:began@16',
      'active:cancelled@50',
      'waiting:failed@50',
      'active:possible@50',
      'waiting:possible@50',
    ]);
  });

  it('cancels an active recognizer from code, which stays cancelled until the lift', () => {
    const h = createHarness();
    const r = new Scripted('r', onMove);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [r]})
      .move(5, 0, 16);
    r.cancel();
    expect(r.state).toBe('cancelled');
    h.finger(1).move(10, 0, 32);
    expect(r.state).toBe('cancelled');
    h.finger(1).up(48);
    expect(r.state).toBe('possible');
  });

  it('runs a deadline due before a late input first, at its own time', () => {
    const h = createHarness();
    const r = new Scripted('r', {
      began: (self, event) => self.waitUntil(event.time + 500),
    });
    h.finger(1).down(0, 0, 1000, {recognizers: [r]});
    // The main thread was blocked: the next input is processed at 1900.
    h.finger(1).move(5, 0, 1900);
    expect(h.log[0]).toBe('r:failed@1500');
  });

  it('never moves the event clock backwards', () => {
    const h = createHarness();
    const r = new Scripted('r', onMove);
    h.finger(1).down(0, 0, 100, {recognizers: [r]});
    h.finger(1).move(5, 0, 90);
    expect(h.log).toEqual(['r:began@100']);
  });
});

/** A clock whose timers run one task at a time, as an event loop does. */
class TaskClock implements GestureClock {
  time = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, {at: number; run: () => void}>();
  now(): number {
    return this.time;
  }
  setTimeout(run: () => void, delay: number): number {
    const id = this.nextId++;
    this.tasks.set(id, {at: this.time + delay, run});
    return id;
  }
  clearTimeout(id: number): void {
    this.tasks.delete(id);
  }
  /** Run the earliest task due by `time`, if any. */
  runTask(time: number): void {
    this.time = time;
    const due = [...this.tasks.entries()]
      .filter(([, task]) => task.at <= time)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (due != null) {
      this.tasks.delete(due[0]);
      due[1].run();
    }
  }
}

/** A long press: recognizes 500 ms after touch-down unless the touch lifts. */
function pressArena(): {clock: TaskClock; arena: GestureArena; log: string[]} {
  const clock = new TaskClock();
  const log: string[] = [];
  const arena: GestureArena = new GestureArena({
    clock,
    onTransition: (recognizer, _from, to) =>
      log.push(`${recognizer.name}:${to}@${arena.now()}`),
  });
  const press = new Scripted('press', {
    began: (self, event) => self.recognizeAt(event.time + 500),
  });
  arena.began([
    {
      id: 1,
      x: 0,
      y: 0,
      time: 0,
      pointerType: 'touch',
      target: null,
      scroll: null,
      recognizers: [press],
      consumer: null,
    },
  ]);
  return {clock, arena, log};
}

describe('arena: a timer that fires late', () => {
  it('lets a lift queued before its deadline run first', () => {
    const {clock, arena, log} = pressArena();
    // A long task held the main thread from 100 to 800 ms; the finger
    // lifted at 300. The timer task runs first, then the queued lift.
    clock.runTask(800);
    arena.ended([{id: 1, x: 0, y: 0, time: 300}]);
    clock.runTask(800);
    expect(log.some(entry => entry.startsWith('press:began'))).toBe(false);
  });

  it('still fires on its deadline when nothing was queued', () => {
    const {clock, arena, log} = pressArena();
    clock.runTask(800);
    clock.runTask(800);
    expect(log).toContain('press:began@500');
    arena.ended([{id: 1, x: 0, y: 0, time: 820}]);
  });
});

describe('arena: claims', () => {
  it('keeps an idle recognizer usable after cancel()', () => {
    const h = createHarness();
    const r = new Scripted('r', onMove);
    r.cancel();
    expect(r.state).toBe('possible');
    h.finger(1)
      .down(0, 0, 0, {recognizers: [r]})
      .move(5, 0, 16);
    expect(h.log).toContain('r:began@16');
    h.finger(1).up(32);
  });

  it('gives back the claim of a waiting recognition that fails', () => {
    const h = createHarness();
    const waiting = new Scripted('waiting', onMove);
    const blocker = new Scripted('blocker');
    waiting.requireToFail(blocker);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [waiting, blocker]})
      .move(5, 0, 16);
    expect(h.arena.isClaimed(1)).toBe(true);
    waiting.cancel();
    expect(waiting.state).toBe('failed');
    expect(h.arena.isClaimed(1)).toBe(false);
    h.finger(1).up(32);
  });

  it('gives a resting finger back when its gesture is cancelled, so a pinch can zoom the page', () => {
    const h = createHarness();
    const r = new Scripted('r', onMove);
    const first = h
      .finger(1)
      .down(0, 0, 0, {recognizers: [r]})
      .move(5, 0, 16);
    expect(h.arena.isClaimed(1)).toBe(true);
    r.cancel();
    expect(h.arena.isClaimed(1)).toBe(false);
    // A second finger lands with nothing on its path: the browser owns both.
    const second = h.finger(2).down(200, 200, 40, {recognizers: []});
    expect(h.arena.isClaimed(2)).toBe(false);
    first.move(0, 0, 56);
    second.move(220, 220, 56);
    expect(h.arena.isClaimed(1)).toBe(false);
    first.up(80);
    second.up(80);
  });
});

/** Records the touches that began off its hit path. */
class ElsewhereRecorder extends Scripted {
  readonly elsewhere: number[] = [];
  protected override touchBeganElsewhere(
    touches: ReadonlyArray<GestureTouch>,
  ): void {
    this.elsewhere.push(...touches.map(touch => touch.id));
  }
}

describe("arena: a touch that begins off an active recognizer's hit path", () => {
  it('is reported to the recognizer, not delivered as its own', () => {
    const h = createHarness();
    const recorder = new ElsewhereRecorder('recorder');
    const first = h.finger(1).down(0, 0, 0, {recognizers: [recorder]});
    expect(recorder.elsewhere).toEqual([]);
    const second = h.finger(2).down(300, 300, 16, {recognizers: []});
    expect(recorder.elsewhere).toEqual([2]);
    expect(recorder.numberOfTouches).toBe(1);
    first.up(40);
    second.up(40);
  });

  it('is not reported to a recognizer tracking nothing', () => {
    const h = createHarness();
    const recorder = new ElsewhereRecorder('recorder');
    h.finger(1)
      .down(0, 0, 0, {recognizers: [recorder]})
      .up(20);
    h.finger(2).down(300, 300, 100, {recognizers: []}).up(120);
    expect(recorder.elsewhere).toEqual([]);
  });
});

describe('arena: resolution order across fingers', () => {
  it('lets the inner recognizer win a tie even when another finger brought the outer one first', () => {
    const h = createHarness();
    const inner = new Scripted('inner', onMove);
    const outer = new Scripted('outer', onMove);
    // Finger 1 lands on the outer view only; finger 2 on the inner view,
    // inside it. Both recognize on the same move event.
    h.arena.began([
      {
        id: 1,
        x: 0,
        y: 0,
        time: 0,
        pointerType: 'touch',
        target: null,
        scroll: null,
        recognizers: [outer],
        consumer: null,
      },
      {
        id: 2,
        x: 50,
        y: 0,
        time: 0,
        pointerType: 'touch',
        target: null,
        scroll: null,
        recognizers: [inner, outer],
        consumer: null,
      },
    ]);
    h.arena.moved([
      {id: 1, x: 10, y: 0, time: 16},
      {id: 2, x: 60, y: 0, time: 16},
    ]);
    expect(inner.state).toBe('began');
    expect(outer.state).toBe('failed');
    h.arena.ended([
      {id: 1, x: 10, y: 0, time: 32},
      {id: 2, x: 60, y: 0, time: 32},
    ]);
  });
});

describe('arena: a held view', () => {
  it('is released in the same settle as the recognizer that held it finishes', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    // Delays the view's touch, then lifts without deciding: it finishes as
    // `possible` with nothing left to track.
    const r = new Scripted('r', {ended: () => {}}, {delaysTouchesBegan: true});
    h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    expect(consumer.events).toEqual([]);
    h.finger(1).up(40);
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
  });
});

describe('arena: review fixes', () => {
  it('runs a cancel from code at the last event time, not wall time', () => {
    const h = createHarness();
    const other = new Scripted('other');
    h.finger(9)
      .down(500, 500, 0, {recognizers: [other]})
      .up(10);
    const press = new Scripted('press', {
      began: (self, event) => self.recognizeAt(event.time + 500),
      moved: (self, event) => {
        const touch = event.allTouches[0];
        if (touch != null && Math.abs(touch.x - touch.startX) > 10) {
          self.fail();
        }
      },
    });
    h.finger(1).down(0, 0, 1000, {recognizers: [press]});
    // Wall time is 1800; a 40 px move stamped 1300 is still queued.
    h.clock.time = 1800;
    other.cancel();
    h.arena.moved([{id: 1, x: 40, y: 0, time: 1300}]);
    expect(h.log).toContain('press:failed@1300');
    expect(h.log.some(entry => entry.startsWith('press:began'))).toBe(false);
    h.finger(1).up(1900, 40, 0);
  });

  it('keeps two recognizers exclusive when only one delegate allows both', () => {
    const h = createHarness();
    const a = new Scripted('a', onMove, {
      shouldRecognizeSimultaneously: () => true,
    });
    const b = new Scripted('b', onMove);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [a, b]})
      .move(5, 0, 16);
    expect(h.log).toContain('a:began@16');
    expect(b.state).toBe('failed');
    h.finger(1).up(32);
  });

  it("gives the click with the touch when the view's hold ends on the lift", () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const r = new Scripted('r', {}, {delaysTouchesBegan: true});
    h.finger(1).down(0, 0, 0, {recognizers: [r], consumer});
    expect(consumer.events).toEqual([]);
    const click = h.finger(1).up(40);
    expect(click).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
    expect(h.deferredClicks).toEqual([]);
  });

  it("keeps a recognized discrete gesture's claim when a partner is cancelled", () => {
    const h = createHarness();
    const swipe = new Scripted(
      'swipe',
      {moved: r => (r.state === 'possible' ? r.recognize() : undefined)},
      {discrete: true},
    );
    const pan = new Scripted('pan', onMove);
    swipe.recognizeSimultaneouslyWith(pan);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [swipe, pan]})
      .move(5, 0, 16);
    expect(swipe.state).toBe('ended');
    expect(h.arena.isClaimed(1)).toBe(true);
    pan.cancel();
    expect(h.arena.isClaimed(1)).toBe(true);
    h.finger(1).up(32);
  });
});

describe('arena: a lift that decides a waiting recognition', () => {
  it('answers the click with the final outcome, not a defer it already resolved', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    // r recognizes at the lift but waits for q to fail; q lifts undecided.
    const q = new Scripted('q', {ended: () => {}});
    const r = atLift('r');
    r.requireToFail(q);
    h.finger(1).down(0, 0, 0, {recognizers: [r, q], consumer});
    const click = h.finger(1).up(40);
    expect(h.log).toContain('r:ended@40');
    expect(click).toBe('suppress');
    expect(h.deferredClicks).toEqual([]);
  });
});

/** Keeps observing a touch the browser took, as a scroll-edge watcher does. */
class Observer extends Scripted {
  protected override touchesTakenByBrowser(): boolean {
    return true;
  }
}

describe('arena: round-five review fixes', () => {
  it('never claims a touch the browser took, even for a watcher that begins later (FR14)', () => {
    const h = createHarness();
    const watcher = new Observer('watcher', onMove);
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [watcher]});
    finger.takenByBrowser(10);
    finger.move(0, 40, 20);
    expect(h.log).toContain('watcher:began@20');
    expect(h.claims).toEqual([]);
    expect(h.arena.isClaimed(1)).toBe(false);
    finger.up(40);
  });

  it('settles once, with the outermost call, when a listener cancels during a touch-down', () => {
    const h = createHarness();
    const elsewhere = new Scripted('elsewhere');
    h.finger(9).down(500, 500, 0, {recognizers: [elsewhere]});
    const consumer = new RecordingConsumer();
    const first = new Scripted('first', {began: () => elsewhere.cancel()});
    const holder = new Scripted('holder', {}, {delaysTouchesBegan: true});
    h.finger(1).down(0, 0, 10, {recognizers: [first, holder], consumer});
    // The holder heard the touch and fails at the lift: the click goes.
    expect(h.finger(1).up(40)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
    h.finger(9).up(50);
  });

  it('keeps a discrete winner exclusive against a waiter its win releases (FR15)', () => {
    const h = createHarness();
    const winner = new Scripted(
      'R',
      {moved: (r, event) => (event.time >= 32 ? r.recognize() : undefined)},
      {discrete: true},
    );
    const blocker = new Scripted('O1', {moved: () => {}});
    const waiter = new Scripted('P', onMove);
    waiter.requireToFail(blocker);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [winner, blocker, waiter]})
      .move(5, 0, 16)
      .move(10, 0, 32);
    expect(h.log).toContain('R:ended@32');
    expect(h.log).not.toContain('P:began@32');
    expect(waiter.state).toBe('failed');
    h.finger(1).up(48);
  });

  it('lets the innermost deadline win a tie at the same instant (FR15)', () => {
    const h = createHarness();
    const inner = new Scripted('inner', {
      moved: (r, event) =>
        r.state === 'possible' && event.time === 10
          ? r.recognizeAt(500)
          : undefined,
    });
    const outer = new Scripted('outer', {
      began: r => r.recognizeAt(500),
      moved: () => {},
    });
    h.finger(1)
      .down(0, 0, 0, {recognizers: [inner, outer]})
      .move(1, 0, 10);
    h.arena.advanceTime(500);
    expect(h.log).toContain('inner:began@500');
    expect(outer.state).toBe('failed');
    h.finger(1).up(600);
  });
});

describe('arena: a waiting recognition that fails on its re-attempt', () => {
  it('gives its claim back when shouldBegin refuses once the requirement fails (FR19)', () => {
    const h = createHarness();
    let mayBegin = true;
    const blocker = new Scripted('q', {
      moved: (r, event) => (event.time >= 32 ? r.fail() : undefined),
    });
    const waiter = new Scripted('r', onMove, {shouldBegin: () => mayBegin});
    waiter.requireToFail(blocker);
    const finger = h
      .finger(1)
      .down(0, 0, 0, {recognizers: [waiter, blocker]})
      .move(20, 0, 16);
    // r waits for q and holds the touch meanwhile.
    expect(h.arena.isClaimed(1)).toBe(true);
    mayBegin = false;
    finger.move(40, 0, 32);
    expect(h.log).toContain('q:failed@32');
    expect(waiter.state).toBe('failed');
    expect(h.arena.isClaimed(1)).toBe(false);
    finger.up(48);
  });
});

describe('arena: a deadline inside a re-entrant entry', () => {
  it('settles with the outermost call, so a listener feeding input mid-delivery orphans nothing', () => {
    const h = createHarness();
    const timed = new Scripted('timed', {
      began: (r, event) => r.recognizeAt(event.time + 180),
    });
    h.finger(9).down(500, 500, 0, {recognizers: [timed]});
    const consumer = new RecordingConsumer();
    // A listener that feeds input while the touch-down is being delivered:
    // the nested entry runs `timed`'s deadline (180).
    const first = new Scripted('first', {
      began: () => {
        h.arena.moved([{id: 9, x: 500, y: 500, time: 200}]);
      },
    });
    const holder = new Scripted('holder', {}, {delaysTouchesBegan: true});
    h.finger(1).down(0, 0, 150, {recognizers: [first, holder], consumer});
    expect(h.log).toContain('timed:began@180');
    expect(h.finger(1).up(250)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
    h.finger(9).up(300);
  });
});
