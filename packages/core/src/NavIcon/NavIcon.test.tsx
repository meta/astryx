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
import {NavIcon} from './NavIcon';

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
