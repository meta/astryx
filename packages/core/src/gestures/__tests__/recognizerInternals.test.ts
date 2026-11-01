// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file recognizerInternals.test.ts
 * @input Uses vitest, TapGestureRecognizer and recognizerInternals
 * @output Checks that a recognizer's arena plumbing is off its public type
 *   and reachable through internals()
 * @position Test for packages/core/src/gestures/recognizerInternals.ts
 *
 * The `@ts-expect-error` lines are the assertion: `tsc` fails if any of
 * these members is public again.
 */

import {describe, expect, it} from 'vitest';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {internals} from '../recognizerInternals';

describe('recognizer internals', () => {
  it('keeps the arena plumbing protected on the published class', () => {
    const tap = new TapGestureRecognizer({name: 'tap'});
    function reachesPlumbing(): void {
      // @ts-expect-error protected: the arena assigns it
      tap.arena = null;
      // @ts-expect-error protected
      void tap.pending;
      // @ts-expect-error protected
      void tap.seenTouchIds;
      // @ts-expect-error protected
      void tap.acceptsTouchInput;
      // @ts-expect-error protected
      tap.requiresFailureOf(tap);
      // @ts-expect-error protected
      tap.allowsSimultaneous(tap);
      // @ts-expect-error protected
      tap.shouldBegin();
      // @ts-expect-error protected
      tap.applyState('began');
      // @ts-expect-error protected
      tap.resetToPossible();
      // @ts-expect-error protected
      tap.deliverCancelled([], {time: 0, allTouches: []});
    }
    expect(typeof reachesPlumbing).toBe('function');
  });

  it('lets the gesture system reach them', () => {
    const tap = new TapGestureRecognizer({name: 'tap'});
    expect(internals(tap).arena).toBeNull();
    expect(internals(tap).acceptsTouchInput).toBe(true);
    expect(internals(tap).shouldBegin()).toBe(true);
  });
});
