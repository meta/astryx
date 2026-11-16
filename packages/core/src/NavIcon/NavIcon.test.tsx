// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavIcon.test.tsx
 * @input Uses vitest, @testing-library/react, NavIcon
 * @output Unit tests for NavIcon component
 * @position Testing; validates NavIcon implementation
 *
 * SYNC: When NavIcon changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {NavIcon} from './NavIcon';

const overrides = stylex.create({
  squared: {borderRadius: '4px'},
});

describe('NavIcon', () => {
  it('renders icon content', () => {
    render(<NavIcon icon={<span data-testid="icon">Icon</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<NavIcon icon={<span>Icon</span>} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLSpanElement));
  });

  it('passes data-testid', () => {
    render(<NavIcon icon={<span>Icon</span>} data-testid="nav-icon" />);
    expect(screen.getByTestId('nav-icon')).toBeInTheDocument();
  });
});

describe('NavIcon theme target names', () => {
  it('renders only the canonical target class', () => {
    render(<NavIcon icon={<span>Icon</span>} data-testid="nav-icon" />);
    const root = screen.getByTestId('nav-icon');
    expect(root).toHaveClass('astryx-nav-icon');
    expect(root).not.toHaveClass('astryx-navicon');
  });
});

describe('NavIcon host element', () => {
  it('forwards other DOM props to the container', () => {
    render(
      <NavIcon
        icon={<span>Icon</span>}
        data-testid="nav-icon"
        id="brand-mark"
        aria-hidden={true}
      />,
    );
    const root = screen.getByTestId('nav-icon');
    expect(root).toHaveAttribute('id', 'brand-mark');
    expect(root).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps its target when className and style are passed', () => {
    render(
      <NavIcon
        icon={<span>Icon</span>}
        data-testid="nav-icon"
        className="brand-mark"
        style={{marginInlineEnd: '4px'}}
      />,
    );
    const root = screen.getByTestId('nav-icon');
    expect(root).toHaveClass('brand-mark');
    expect(root).toHaveClass('astryx-nav-icon');
    expect(root.style.marginInlineEnd).toBe('4px');
  });

  it('applies xstyle after its own styles', () => {
    render(
      <NavIcon
        icon={<span>Icon</span>}
        data-testid="nav-icon"
        xstyle={overrides.squared}
      />,
    );
    expect(getComputedStyle(screen.getByTestId('nav-icon')).borderRadius).toBe(
      '4px',
    );
  });

  it('adds no role, name, or focus stop', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <NavIcon icon={<svg aria-hidden="true" />} data-testid="nav-icon" />
        <button type="button">After</button>
      </>,
    );
    const root = screen.getByTestId('nav-icon');
    expect(root).not.toHaveAttribute('role');
    expect(root).not.toHaveAttribute('tabindex');
    expect(root).not.toHaveAccessibleName();
    await user.tab();
    expect(screen.getByRole('button', {name: 'Before'})).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
  });
});
