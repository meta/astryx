// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file outsidePanClaim.test.ts
 * @input watchOutsidePans on a layer, with stubbed pointer capture and
 *   jsdom's computed styles
 * @output A touch outside the layer that begins to pan is claimed: its
 *   pointer is captured by the layer, and its lift (`touchend`) is cancelled
 *   at the release. A tap outside, a pan inside and a pan after the watch
 *   stopped are left alone
 * @position Unit test of packages/core/src/Layer/outsidePanClaim.ts
 */

import {fireEvent} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {currentGesture} from './gestureCounter';
import {watchOutsidePans} from './outsidePanClaim';
import {__resetClickGuardForTest} from '../utils/clickGuard';

const touch = (pointerId: number, y: number) => ({
  pointerType: 'touch',
  pointerId,
  isPrimary: true,
  clientX: 10,
  clientY: y,
  composed: true,
});

const touchEnd = () =>
  new Event('touchend', {bubbles: true, cancelable: true, composed: true});

describe('watchOutsidePans', () => {
  let captured: number[] = [];
  beforeEach(() => {
    captured = [];
    HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
      captured.push(pointerId);
    };
    HTMLElement.prototype.hasPointerCapture = () => false;
    // Reading the gesture installs its listeners before the press.
    currentGesture();
  });
  afterEach(() => {
    __resetClickGuardForTest();
    document.body.replaceChildren();
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  });

  function setup() {
    const layer = document.createElement('div');
    const page = document.createElement('div');
    document.body.append(layer, page);
    const stop = watchOutsidePans(layer);
    return {layer, page, stop};
  }

  /** A finger on `target` that moves to `toY`, lifts, and sends its touchend. */
  function press(target: Element, pointerId: number, toY: number): Event {
    fireEvent.pointerDown(target, touch(pointerId, 300));
    fireEvent.pointerMove(target, touch(pointerId, toY));
    fireEvent.pointerUp(target, touch(pointerId, toY));
    const lift = touchEnd();
    target.dispatchEvent(lift);
    return lift;
  }

  it('claims a pan outside: the layer takes its pointer and its lift is cancelled', () => {
    const {page, stop} = setup();
    const lift = press(page, 5, 280);
    expect(captured).toEqual([5]);
    expect(lift.defaultPrevented).toBe(true);
    stop();
  });

  it('leaves a tap outside, so it still light-dismisses', () => {
    const {page, stop} = setup();
    const lift = press(page, 5, 300);
    expect(captured).toEqual([]);
    expect(lift.defaultPrevented).toBe(false);
    stop();
  });

  it('leaves a pan that starts in the layer, and every pan once stopped', () => {
    const {layer, page, stop} = setup();
    expect(press(layer, 5, 280).defaultPrevented).toBe(false);
    stop();
    expect(press(page, 6, 280).defaultPrevented).toBe(false);
    expect(captured).toEqual([]);
  });
});
