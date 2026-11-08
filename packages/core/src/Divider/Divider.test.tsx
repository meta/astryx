// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Divider.test.tsx
 * @input Uses vitest, @testing-library/react, Divider component
 * @output Unit tests for Divider component behavior
 * @position Testing; validates Divider.tsx implementation
 *
 * SYNC: When Divider.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Divider} from './Divider';

describe('Divider', () => {
  it('renders horizontal by default', () => {
    render(<Divider data-testid="divider" />);
    const element = screen.getByTestId('divider');
    expect(element).toBeInTheDocument();
    expect(element).toHaveAttribute('role', 'separator');
    expect(element).toHaveAttribute('aria-orientation', 'horizontal');
    // Without label, should have 1 child (single line)
    const children = Array.from(element.children);
    expect(children.length).toBe(1);
  });

  it('renders vertical when specified', () => {
    render(<Divider orientation="vertical" data-testid="divider" />);
    const element = screen.getByTestId('divider');
    expect(element).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('renders with label', () => {
    render(<Divider label="Section" />);
    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('renders label centered with lines on both sides', () => {
    render(<Divider label="Center" data-testid="divider" />);
    const divider = screen.getByTestId('divider');
    expect(divider).toBeInTheDocument();
    expect(screen.getByText('Center')).toBeInTheDocument();
    // Should have 3 children: line, label, line
    const children = Array.from(divider.children);
    expect(children.length).toBe(3);
  });

  it('applies isFullBleed styles', () => {
    render(<Divider isFullBleed data-testid="divider" />);
    const element = screen.getByTestId('divider');
    expect(element).toBeInTheDocument();
    // isFullBleed is applied via stylex, we verify component renders without error
  });

  it('applies subtle variant by default', () => {
    render(<Divider data-testid="divider" />);
    const element = screen.getByTestId('divider');
    expect(element).toBeInTheDocument();
  });

  it('applies strong variant when specified', () => {
    render(<Divider variant="strong" data-testid="divider" />);
    const element = screen.getByTestId('divider');
    expect(element).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Divider ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes through additional props', () => {
    render(<Divider data-testid="divider" aria-label="Content separator" />);
    const element = screen.getByTestId('divider');
    expect(element).toHaveAttribute('aria-label', 'Content separator');
  });

  it('renders with ReactNode as label', () => {
    render(
      <Divider
        label={<span data-testid="custom-label">Custom</span>}
        data-testid="divider"
      />,
    );
    expect(screen.getByTestId('custom-label')).toBeInTheDocument();
  });

  it('renders vertical divider with label', () => {
    render(
      <Divider orientation="vertical" label="Vertical" data-testid="divider" />,
    );
    const divider = screen.getByTestId('divider');
    expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByText('Vertical')).toBeInTheDocument();
  });

  it('exposes the label as the accessible name of the separator', () => {
    render(<Divider label="Section" data-testid="divider" />);
    const divider = screen.getByTestId('divider');
    expect(divider).toHaveAttribute('aria-labelledby');
    expect(divider).toHaveAccessibleName('Section');
  });

  it('names the separator from a ReactNode label via aria-labelledby', () => {
    render(<Divider label={<span>Custom</span>} data-testid="divider" />);
    expect(screen.getByTestId('divider')).toHaveAccessibleName('Custom');
  });

  it('does not set aria-labelledby without a label', () => {
    render(<Divider data-testid="divider" />);
    expect(screen.getByTestId('divider')).not.toHaveAttribute(
      'aria-labelledby',
    );
  });

  it('prefers an explicit aria-label over the rendered label', () => {
    render(
      <Divider
        label="Section"
        aria-label="Custom name"
        data-testid="divider"
      />,
    );
    const divider = screen.getByTestId('divider');
    expect(divider).toHaveAccessibleName('Custom name');
    expect(divider).not.toHaveAttribute('aria-labelledby');
  });

  it.each([false, true, ''])('omits a label wrapper for %j', label => {
    render(<Divider label={label} data-testid="divider" />);
    const divider = screen.getByTestId('divider');
    expect(divider).not.toHaveAttribute('aria-labelledby');
    expect(divider.children).toHaveLength(1);
  });

  it('preserves a numeric zero label and uses it as the accessible name', () => {
    render(<Divider label={0} data-testid="divider" />);
    const divider = screen.getByTestId('divider');
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(divider).toHaveAccessibleName('0');
    expect(divider.children).toHaveLength(3);
  });

  it('renders astryx-* class names for theme targeting', () => {
    render(
      <Divider variant="strong" orientation="vertical" data-testid="divider" />,
    );
    const root = screen.getByTestId('divider');
    expect(root.className).toContain('astryx-divider');
    expect(root).toHaveAttribute('data-variant', 'strong');
    expect(root).toHaveAttribute('data-orientation', 'vertical');
  });
});
