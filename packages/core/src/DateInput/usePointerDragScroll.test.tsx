// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePointerDragScroll.test.tsx
 * @input usePointerDragScroll on a list of rows, with Reduced Motion on or off
 * @output Proof that a mouse drag's release lands on the nearest row at once
 *   under Reduced Motion and glides there otherwise
 * @position Testing for /packages/core/src/DateInput/usePointerDragScroll.ts
 */

import {render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {usePointerDragScroll} from './usePointerDragScroll';

const ROW_HEIGHT = 40;

function Rows() {
  const ref = useRef<HTMLDivElement | null>(null);
  usePointerDragScroll(ref);
  return (
    <div ref={ref} data-testid="wheel">
      {Array.from({length: 10}, (_, i) => (
        <div key={i} role="option" aria-selected={false}>
          {i}
        </div>
      ))}
    </div>
  );
}

function stubReducedMotion(isReduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: isReduced && /prefers-reduced-motion:\s*reduce/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function dragAndRelease(): ReturnType<typeof vi.fn> {
  const {getByTestId, getAllByRole} = render(<Rows />);
  const wheel = getByTestId('wheel');
  for (const row of getAllByRole('option')) {
    Object.defineProperty(row, 'offsetHeight', {value: ROW_HEIGHT});
  }
  const scrollTo = vi.fn();
  wheel.scrollTo = scrollTo;
  wheel.setPointerCapture = () => {};
  wheel.hasPointerCapture = () => false;
  const pointer = (type: string, clientY: number) =>
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientY,
      pointerId: 1,
      pointerType: 'mouse',
    });
  wheel.dispatchEvent(pointer('pointerdown', 200));
  // A pull that ends between rows.
  wheel.dispatchEvent(pointer('pointermove', 150));
  wheel.dispatchEvent(pointer('pointerup', 150));
  return scrollTo;
}

describe('usePointerDragScroll release', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lands on the nearest row at once under Reduced Motion', () => {
    stubReducedMotion(true);
    const scrollTo = dragAndRelease();
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({behavior: 'instant'}),
    );
  });

  it('glides to the nearest row otherwise', () => {
    stubReducedMotion(false);
    const scrollTo = dragAndRelease();
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({behavior: 'smooth'}),
    );
  });
});
