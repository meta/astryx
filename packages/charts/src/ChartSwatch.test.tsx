// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartSwatch.test.tsx
 * @input Uses vitest, @testing-library/react, ChartSwatch
 * @output Functional tests for the ChartSwatch color primitive
 * @position Colocated test for ChartSwatch.tsx (issue #4295 viz coverage)
 */

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {ChartSwatch, swatchVariantForType} from './ChartSwatch';

describe('ChartSwatch', () => {
  it('renders a decorative element hidden from the accessibility tree', () => {
    const {container} = render(<ChartSwatch color="#ff0000" />);
    const swatch = container.firstElementChild;
    expect(swatch).not.toBeNull();
    expect(swatch).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies the given color through a dynamic style', () => {
    const {container} = render(<ChartSwatch color="#ff0000" />);
    const swatch = container.firstElementChild as HTMLElement;
    expect(swatch.getAttribute('style')).toContain('#ff0000');
  });

  it('styles the square and line variants differently', () => {
    const {container: square} = render(<ChartSwatch color="#000" />);
    const {container: line} = render(
      <ChartSwatch color="#000" variant="line" />,
    );
    expect(square.firstElementChild!.className).not.toBe(
      line.firstElementChild!.className,
    );
  });
});

describe('swatchVariantForType', () => {
  it('maps bar series to the square chip', () => {
    expect(swatchVariantForType('bar')).toBe('square');
  });

  it('maps every non-bar series (and unknown types) to the line stroke', () => {
    expect(swatchVariantForType('line')).toBe('line');
    expect(swatchVariantForType('dot')).toBe('line');
    expect(swatchVariantForType('area')).toBe('line');
    expect(swatchVariantForType(undefined)).toBe('line');
  });
});
