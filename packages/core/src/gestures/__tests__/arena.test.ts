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
import {createHarness, RecordingConsumer} from './harness';
import {internals} from '../recognizerInternals';

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
    expect(internals(single).pending).toBe('ended');
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
    expect(internals(single).pending).toBe('ended');
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
