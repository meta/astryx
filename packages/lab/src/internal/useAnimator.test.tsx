// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnimator.test.tsx
 * @input vitest (jsdom), React Testing Library, the hook
 * @output Checks that the animator is stable, attaches through the ref, and
 *   never re-renders its component while animating, retargeting or tracking
 * @position Testing; validates useAnimator.ts
 */

import {act, render} from '@testing-library/react';
import {useEffect} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Animator} from '@astryxdesign/core/internal/motion';
import {useAnimator} from './useAnimator';

/** A critically damped half-second spring (SwiftUI's default). */
const SETTLE = {duration: 0.5, bounce: 0} as const;
/** A stiff, heavy spring (UIKit's sheet presentation). */
const SHEET = {mass: 3, stiffness: 1000, damping: 500} as const;

beforeEach(() => {
  HTMLElement.prototype.animate = function () {
    return {startTime: null, cancel: vi.fn()} as unknown as Animation;
  };
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

/** A component that hands its animator out, for the unmount test. */
function UnmountProbe({box}: {box: {current: Animator | null}}) {
  const {ref, animator} = useAnimator();
  box.current = animator;
  return <div ref={ref} />;
}

describe('useAnimator', () => {
  it('keeps one animator and ref, and never re-renders while animating', () => {
    let renders = 0;
    const seen = new Set<Animator>();
    const refs = new Set<unknown>();
    let api: Animator | null = null;
    function Probe() {
      renders++;
      const {ref, animator} = useAnimator();
      seen.add(animator);
      refs.add(ref);
      useEffect(() => {
        api = animator;
      });
      return <div ref={ref} data-testid="probe" />;
    }
    const {rerender, getByTestId} = render(<Probe />);
    const before = renders;
    act(() => {
      api?.animate({x: 100}, {spring: SETTLE});
      for (let x = 0; x < 50; x++) {
        api?.set({y: x});
      }
      api?.animate({x: 10}, {spring: SETTLE});
      api?.stop();
    });
    expect(renders).toBe(before);
    expect(getByTestId('probe').style.translate).not.toBe('');
    rerender(<Probe />);
    expect(seen.size).toBe(1);
    expect(refs.size).toBe(1);
  });

  it('attaches on mount and detaches on unmount', () => {
    const box: {current: Animator | null} = {current: null};
    function Probe() {
      const {ref, animator} = useAnimator({initial: {opacity: 0.5}});
      box.current = animator;
      return <div ref={ref} data-testid="probe" />;
    }
    const {getByTestId, unmount} = render(<Probe />);
    const element = getByTestId('probe');
    expect(box.current?.element).toBe(element);
    expect(element.style.opacity).toBe('0.5');
    unmount();
    expect(box.current?.element).toBeNull();
  });

  it('ends its callers waits on unmount and keeps no timer for them', async () => {
    vi.useFakeTimers();
    try {
      const box: {current: Animator | null} = {current: null};
      const {unmount} = render(<UnmountProbe box={box} />);
      const animator = box.current!;
      const handle = animator.animate({x: 100}, {spring: SHEET});
      let rested = false;
      void animator.atRest().then(() => {
        rested = true;
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      // Without advancing time: the curve has not ended.
      await expect(handle.finished).resolves.toBe(false);
      expect(rested).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
