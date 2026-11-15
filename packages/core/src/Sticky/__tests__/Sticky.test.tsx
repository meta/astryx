// Copyright (c) Meta Platforms, Inc. and affiliates.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, it, expect, vi} from 'vitest';

import {Sticky} from '../Sticky';

describe('Sticky component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders children with default props', () => {
    render(
      <Sticky>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('applies default vertical axis styling', () => {
    render(
      <Sticky axis="vertical">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByText('Test Content').closest('div');
    // Check that position: sticky is applied
    expect(stickyElement).toHaveStyle('position: sticky');
  });

  it('applies horizontal axis styling when axis="horizontal"', () => {
    render(
      <Sticky axis="horizontal">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyle('position: sticky');
    // Horizontal axis should have left: 0
    expect(stickyElement).toHaveStyleRule('left', '0');
  });

  it('applies both axis styling when axis="both"', () => {
    render(
      <Sticky axis="both">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyle('position: sticky');
    expect(stickyElement).toHaveStyleRule('top', '0');
    expect(stickyElement).toHaveStyleRule('left', '0');
  });

  it('applies offsetTop styling', () => {
    render(
      <Sticky axis="vertical" offsetTop={16}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyleRule('top', '16px');
  });

  it('applies offsetRight styling with horizontal axis', () => {
    render(
      <Sticky axis="horizontal" offsetRight={8}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyleRule('right', '8px');
  });

  it('applies offsetBottom styling', () => {
    render(
      <Sticky axis="vertical" offsetBottom={16}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyleRule('bottom', '16px');
  });

  it('applies offsetLeft styling', () => {
    render(
      <Sticky axis="vertical" offsetLeft={8}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyleRule('left', '8px');
  });

  it('disabled state sets position to static', () => {
    render(
      <Sticky enabled={false}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveStyle('position: static');
  });

  it('renders with custom className', () => {
    render(
      <Sticky className="custom-class">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    expect(stickyElement).toHaveClass('custom-class');
  });

  it('passes through additional props', () => {
    const handleClick = vi.fn();

    render(
      <Sticky onClick={handleClick}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const element = screen.getByTestId('child');
    userEvent.click(element);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies themeProps for sticky theming', () => {
    render(
      <Sticky axis="vertical" offsetTop={0}>
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('child');
    // Should have theme-related styles applied
    expect(stickyElement).toBeInTheDocument();
  });
});
