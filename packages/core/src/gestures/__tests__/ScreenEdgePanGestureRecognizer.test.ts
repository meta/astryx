// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScreenEdgePanGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output ScreenEdgePanGestureRecognizer's state machine: the edge band, RTL edges, inward movement
 * @position Unit tests of packages/core/src/gestures/ScreenEdgePanGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {createHarness} from './harness';

describe('ScreenEdgePanGestureRecognizer', () => {
  it('begins from the leading band and fails elsewhere at touch-down', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge]})
      .drag(40, 4, 50);
    expect(h.log[0]).toMatch(/^edge:began@/);
    expect(edge.activeEdge).toBe('left');

    const middle = createHarness();
    const miss = new ScreenEdgePanGestureRecognizer({name: 'miss'});
    middle.finger(1).down(60, 300, 0, {recognizers: [miss]});
    expect(middle.log).toEqual(['miss:failed@0']);
  });

  it('resolves the leading edge under RTL and requires inward movement', () => {
    const h = createHarness();
    h.environment.rtl = true;
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(385, 300, 0, {recognizers: [edge]})
      .drag(-40, 2, 50);
    expect(edge.activeEdge).toBe('right');
    expect(h.log[0]).toMatch(/^edge:began@/);

    const outward = createHarness();
    const back = new ScreenEdgePanGestureRecognizer({name: 'back'});
    outward
      .finger(1)
      .down(10, 300, 0, {recognizers: [back]})
      .drag(-8, 30, 50);
    expect(back.state).toBe('failed');
  });
});
