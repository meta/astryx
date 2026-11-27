// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TruncationTooltip.test.tsx
 * @input useTruncationTooltipInterest with a measure, and mouse moves
 * @output Proof that a hover measures the text once, on its first move, and
 *   again only after the pointer leaves and a new hover starts
 * @position Unit tests for Text/TruncationTooltip.tsx.
 */

import type {PointerEvent} from 'react';
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {useTruncationTooltipInterest} from './TruncationTooltip';

function mouseMove(): PointerEvent<HTMLElement> {
  return {
    pointerType: 'mouse',
    nativeEvent: new MouseEvent('pointermove'),
  } as unknown as PointerEvent<HTMLElement>;
}

describe('useTruncationTooltipInterest: hover', () => {
  it('measures once per hover, not on every move', () => {
    // Text that fits: the measure says it is not truncated, so no hover
    // ever becomes the interest.
    const measure = vi.fn(() => false);
    const {result} = renderHook(() =>
      useTruncationTooltipInterest(false, measure),
    );
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.onPointerMove(mouseMove());
      }
    });
    expect(measure).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.onPointerLeave({} as unknown as PointerEvent<HTMLElement>);
      result.current.onPointerMove(mouseMove());
      result.current.onPointerMove(mouseMove());
    });
    expect(measure).toHaveBeenCalledTimes(2);
  });
});
