// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file arenaTapLongPress.test.ts
 * @input GestureArena with taps, long presses and consumers, driven by
 *   synthetic touches with explicit timestamps
 * @output The arena with real discrete and press recognizers: tap vs double
 *   tap with and without require-to-fail, delegate requirements, delivery and
 *   deferred clicks, cancellation before and after a long press began
 * @position Unit tests of packages/core/src/gestures/GestureArena.ts; the
 *   arena's own rules, with scripted recognizers, are in arena.test.ts
 */

import {describe, expect, it} from 'vitest';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';
import {createHarness, RecordingConsumer} from './harness';

const INTERVAL = UIKIT_GESTURES.tap.maximumIntervalBetweenTaps.value;

describe('conflict matrix', () => {
  it('tap vs double tap, single requires double to fail: the single waits out the interval', () => {
    const h = createHarness();
    const single = new TapGestureRecognizer({name: 'single'});
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    single.requireToFail(double);
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    h.finger(1).up(80);
    expect(single.state).toBe('possible');
    expect(single.pending).toBe('ended');
    h.advance(80 + INTERVAL);
    expect(h.log).toEqual([
      `double:failed@${80 + INTERVAL}`,
      `single:ended@${80 + INTERVAL}`,
      `single:possible@${80 + INTERVAL}`,
      `double:possible@${80 + INTERVAL}`,
    ]);
  });

  it('tap vs double tap, single requires double to fail: a double tap fails the single', () => {
    const h = createHarness();
    const single = new TapGestureRecognizer({name: 'single'});
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    single.requireToFail(double);
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    h.finger(1).up(80);
    h.finger(2).down(2, 2, 200, {recognizers: [single, double]});
    h.finger(2).up(260);
    expect(h.log).toEqual([
      'double:ended@260',
      'single:failed@260',
      'single:possible@260',
      'double:possible@260',
    ]);
  });

  it('tap vs double tap with no requirement: the single wins at once and fails the double', () => {
    const h = createHarness();
    const single = new TapGestureRecognizer({name: 'single'});
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    h.finger(1).up(80);
    expect(h.log.slice(0, 2)).toEqual(['single:ended@80', 'double:failed@80']);
  });

  it('a recognizer that is not involved holds nothing up', () => {
    const h = createHarness();
    const idle = new TapGestureRecognizer({name: 'idle'});
    const tap = new TapGestureRecognizer({name: 'tap'});
    tap.requireToFail(idle);
    h.finger(1).down(0, 0, 0, {recognizers: [tap]});
    h.finger(1).up(50);
    expect(h.log[0]).toBe('tap:ended@50');
  });

  it('honors delegate failure requirements', () => {
    const h = createHarness();
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    const single = new TapGestureRecognizer({
      name: 'single',
      shouldRequireFailureOf: (_self, other) => other === double,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [single, double]});
    h.finger(1).up(50);
    expect(single.pending).toBe('ended');
  });
});

describe('delivery to the view', () => {
  it('delivers an unclaimed touch to the consumer and allows its click', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const press = new LongPressGestureRecognizer({name: 'press'});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [press], consumer});
    finger.move(3, 0, 16);
    expect(finger.up(60)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'moved:1', 'ended:1']);
  });

  it('cancels the view and swallows the click when a recognizer takes the touch', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const press = new LongPressGestureRecognizer({name: 'press'});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [press], consumer});
    h.advance(500);
    expect(consumer.events).toEqual(['began:1', 'cancelled:1']);
    expect(h.claims).toEqual([1]);
    expect(finger.up(600)).toBe('suppress');
  });

  it('keeps the view and the click with cancelsTouchesInView off', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const press = new LongPressGestureRecognizer({
      name: 'press',
      cancelsTouchesInView: false,
    });
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [press], consumer});
    h.advance(500);
    expect(finger.up(600)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
  });

  it('defers the click of a tap a double tap may still claim, then replays it', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [double], consumer});
    expect(finger.up(70)).toBe('defer');
    expect(consumer.events).toEqual(['began:1']);
    h.advance(70 + INTERVAL);
    expect(consumer.events).toEqual(['began:1', 'ended:1']);
    expect(h.deferredClicks).toEqual([
      {id: 1, allowed: true, time: 70 + INTERVAL},
    ]);
  });

  it('drops the deferred click when the double tap is recognized', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const double = new TapGestureRecognizer({
      name: 'double',
      numberOfTapsRequired: 2,
    });
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

  it('cancels the view when the browser takes the touch', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const tap = new TapGestureRecognizer({name: 'tap'});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [tap], consumer});
    finger.takenByBrowser(30);
    expect(consumer.events).toEqual(['began:1', 'cancelled:1']);
    expect(h.log).toEqual(['tap:failed@30', 'tap:possible@30']);
  });
});

describe('cancellation', () => {
  it('a system cancel cancels an active gesture and fails a possible one', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    const tap = new TapGestureRecognizer({name: 'tap'});
    h.finger(1).down(0, 0, 0, {recognizers: [press]});
    h.advance(500);
    h.finger(2).down(100, 0, 600, {recognizers: [tap]});
    h.arena.cancelled([1, 2], 650);
    expect(h.log).toEqual([
      'press:began@500',
      'press:cancelled@650',
      'tap:failed@650',
      'press:possible@650',
      'tap:possible@650',
    ]);
  });

  it('a long press cancelled before its duration never begins', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    h.finger(1).down(0, 0, 0, {recognizers: [press]});
    h.finger(1).cancel(200);
    h.advance(1000);
    expect(h.log).toEqual(['press:failed@200', 'press:possible@200']);
  });
});
