// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file arenaPinchSwipeEdge.test.ts
 * @input GestureArena with pinches, swipes, edge pans and pans, driven by
 *   synthetic touches with explicit timestamps
 * @output Simultaneous recognition (pinch + pan), the first to recognize
 *   winning without permission, edge pan vs inner pan, swipe vs pan, and a
 *   delayed touch delivery
 * @position Unit tests of packages/core/src/gestures/GestureArena.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_PINCH, UIKIT_SWIPE} from '../../motion/uikit/gestures';
import {GestureRecognizer} from '../GestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PinchGestureRecognizer} from '../PinchGestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {SwipeGestureRecognizer} from '../SwipeGestureRecognizer';
import {createHarness, RecordingConsumer} from './harness';

/**
 * A recognizer that stays possible, even past its finger's lift, until the
 * test fails it: something another recognizer can wait on.
 */
class Held extends GestureRecognizer {
  // Possible until failed, as a tap waiting for its next tap.
  override get kind(): GestureRecognizer['kind'] {
    return 'tap';
  }

  private isWaiting = true;

  override isInvolved(): boolean {
    return super.isInvolved() || this.isWaiting;
  }

  fail(): void {
    this.isWaiting = false;
    this.setState('failed');
  }
}

describe('conflict matrix', () => {
  it('pinch + pan recognize simultaneously when allowed', () => {
    const h = createHarness();
    const pinch = new PinchGestureRecognizer({name: 'pinch'});
    const pan = new PanGestureRecognizer({name: 'pan'});
    pinch.recognizeSimultaneouslyWith(pan);
    h.finger(1).down(100, 100, 0, {recognizers: [pinch, pan]});
    h.finger(2).down(200, 100, 0, {recognizers: [pinch, pan]});
    h.finger(1).move(80, 120, 16);
    h.finger(2).move(240, 120, 16);
    expect(h.log.slice(0, 2)).toEqual(['pinch:began@16', 'pan:began@16']);
    // Span 100 -> 160, measured against 100 + 8.
    expect(pinch.scale).toBeCloseTo(160 / 108, 5);
    // The pan began at the first finger's move, centroid (-10, 10), which
    // the hysteresis swallows; the second finger's move brought it to (10, 20).
    expect(pan.translation()).toEqual({x: 20, y: 10});
  });

  it('pinch vs pan without permission: the first to recognize wins', () => {
    const h = createHarness();
    const pinch = new PinchGestureRecognizer({name: 'pinch'});
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1).down(100, 100, 0, {recognizers: [pinch, pan]});
    h.finger(2).down(200, 100, 0, {recognizers: [pinch, pan]});
    h.finger(1).move(80, 120, 16);
    h.finger(2).move(240, 120, 16);
    expect(h.log.slice(0, 2)).toEqual(['pinch:began@16', 'pan:failed@16']);
  });

  it('edge pan vs inner pan: in the band the edge pan wins, elsewhere the inner pan runs undelayed', () => {
    const band = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    const inner = new PanGestureRecognizer({
      name: 'inner',
      direction: 'horizontal',
    });
    inner.requireToFail(edge);
    // A thin edge view: the edge zone, where the pan takes its axis.
    band.environment.view = {width: edge.edgeRegion, height: 844};
    band.finger(1).down(8, 300, 0, {recognizers: [inner, edge]});
    band.finger(1).drag(60, 2, 60, 6);
    // The edge pan's own hysteresis is 15 px: the second 10 px step.
    expect(band.log.slice(0, 2)).toEqual(['edge:began@20', 'inner:failed@20']);

    const middle = createHarness();
    const edge2 = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    const inner2 = new PanGestureRecognizer({
      name: 'inner',
      direction: 'horizontal',
    });
    inner2.requireToFail(edge2);
    middle.finger(1).down(150, 300, 0, {recognizers: [inner2, edge2]});
    // Failed at touch-down, before any movement: nothing waits on it.
    expect(middle.log).toEqual(['edge:failed@0']);
    middle.finger(1).drag(60, 2, 60, 6);
    expect(middle.log[1]).toBe('inner:began@10');
  });

  it('swipe vs pan: the pan wins by default, the swipe when the pan requires it to fail', () => {
    const plain = createHarness();
    const swipe = new SwipeGestureRecognizer({name: 'swipe'});
    const pan = new PanGestureRecognizer({name: 'pan'});
    plain
      .finger(1)
      .down(0, 0, 0, {recognizers: [swipe, pan]})
      .drag(80, 0, 60, 6);
    expect(plain.log.slice(0, 2)).toEqual(['pan:began@10', 'swipe:failed@10']);

    const ordered = createHarness();
    const swipe2 = new SwipeGestureRecognizer({name: 'swipe'});
    const pan2 = new PanGestureRecognizer({name: 'pan'});
    pan2.requireToFail(swipe2);
    ordered
      .finger(1)
      .down(0, 0, 0, {recognizers: [swipe2, pan2]})
      .drag(80, 0, 60, 8);
    expect(ordered.log.slice(0, 2)).toEqual([
      'swipe:ended@37.5',
      'pan:failed@37.5',
    ]);

    const slow = createHarness();
    const swipe3 = new SwipeGestureRecognizer({name: 'swipe'});
    const pan3 = new PanGestureRecognizer({name: 'pan'});
    pan3.requireToFail(swipe3);
    slow
      .finger(1)
      .down(0, 0, 0, {recognizers: [swipe3, pan3]})
      .drag(30, 0, 300, 3);
    expect(pan3.state).toBe('possible');
    slow.advance(500);
    // The swipe ran out of time; the waiting pan begins with what it has.
    expect(slow.log.slice(0, 2)).toEqual(['swipe:failed@500', 'pan:began@500']);
  });
});

describe('a recognizer waiting on another', () => {
  it('a swipe holds its recognition past its lift and its deadline (spec:AST-094 FR15)', () => {
    const h = createHarness();
    const held = new Held({name: 'held'});
    const swipe = new SwipeGestureRecognizer({name: 'swipe'});
    swipe.requireToFail(held);
    h.finger(1)
      .down(0, 0, 0, {recognizers: [swipe, held]})
      .drag(80, 0, 60, 8)
      .up(70);
    h.advance(UIKIT_SWIPE.maximumDuration.value + 100);
    expect(swipe.state).toBe('possible');
    expect(h.log.some(entry => entry.startsWith('swipe:failed'))).toBe(false);
    held.fail();
    expect(h.log).toContain(
      `swipe:ended@${UIKIT_SWIPE.maximumDuration.value + 100}`,
    );
    expect(swipe.recognizedDirection).toBe('right');
  });

  it('a pinch keeps its start once it passes the hysteresis, so it begins at the scale its fingers show (spec:AST-094 FR15)', () => {
    const h = createHarness();
    const held = new Held({name: 'held'});
    const pinch = new PinchGestureRecognizer({name: 'pinch'});
    pinch.requireToFail(held);
    h.finger(1).down(100, 100, 0, {recognizers: [pinch, held]});
    h.finger(2).down(200, 100, 0, {recognizers: [pinch, held]});
    // Span 100 -> 120 -> 140 -> 160 while the pinch waits.
    h.finger(2).move(220, 100, 16);
    h.finger(2).move(240, 100, 32);
    h.finger(2).move(260, 100, 48);
    expect(pinch.state).toBe('possible');
    held.fail();
    expect(h.log).toContain('pinch:began@48');
    // Measured against 100 + 8 once, not re-based on every move.
    const hysteresis = UIKIT_PINCH.hysteresis.value;
    expect(pinch.scale).toBeCloseTo(160 / (100 + hysteresis), 5);
  });
});

describe('delivery to the view', () => {
  it('holds the began with delaysTouchesBegan until the recognizer fails', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const swipe = new SwipeGestureRecognizer({
      name: 'swipe',
      delaysTouchesBegan: true,
    });
    h.finger(1).down(0, 0, 0, {recognizers: [swipe], consumer});
    expect(consumer.events).toEqual([]);
    h.advance(UIKIT_SWIPE.maximumDuration.value);
    expect(consumer.events).toEqual(['began:1']);
  });
});
