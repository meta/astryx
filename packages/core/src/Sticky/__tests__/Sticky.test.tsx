// Copyright (c) Meta Platforms, Inc. and affiliates.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {describe, it, expect, vi} from 'vitest';

import {Sticky} from '../Sticky';

const customStyles = stylex.create({custom: {marginTop: 16}});

describe('Sticky component', () => {
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
      <Sticky axis="vertical" data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    // Check that position: sticky is applied
    expect(stickyElement).toHaveStyle('position: sticky');
  });

  it('applies horizontal axis styling when axis="horizontal"', () => {
    render(
      <Sticky axis="horizontal" data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement).toHaveStyle('position: sticky');
    expect(stickyElement.className).toContain('axisHorizontal');
  });

  it('applies both axis styling when axis="both"', () => {
    render(
      <Sticky axis="both" data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement).toHaveStyle('position: sticky');
    expect(stickyElement.className).toContain('axisBoth');
  });

  it('applies offsetTop styling', () => {
    render(
      <Sticky axis="vertical" offsetTop={16} data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement.className).toContain('dynamicStyles.top');
    expect(stickyElement.getAttribute('style')).toContain('16px');
  });

  it('applies inline end offset with horizontal axis', () => {
    render(
      <Sticky axis="horizontal" offsetInlineEnd={8} data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement.className).toContain('dynamicStyles.insetInlineEnd');
    expect(stickyElement.getAttribute('style')).toContain('8px');
  });

  it('applies offsetBottom styling', () => {
    render(
      <Sticky axis="vertical" offsetBottom={16} data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement.className).toContain('dynamicStyles.bottom');
    expect(stickyElement.getAttribute('style')).toContain('16px');
  });

  it('applies inline start offset', () => {
    render(
      <Sticky axis="horizontal" offsetInlineStart={8} data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement.className).toContain('dynamicStyles.insetInlineStart');
    expect(stickyElement.getAttribute('style')).toContain('8px');
  });

  it('disabled state sets position to static', () => {
    render(
      <Sticky isEnabled={false} data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement).toHaveStyle('position: static');
  });

  it('renders with custom className', () => {
    render(
      <Sticky className="custom-class" data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement).toHaveClass('custom-class');
  });

  it('passes through additional props', async () => {
    const handleClick = vi.fn();

    render(
      <Sticky onClick={handleClick} data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const element = screen.getByTestId('sticky');
    const user = userEvent.setup();
    await user.click(element);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies consumer StyleX styles', () => {
    render(
      <Sticky
        axis="vertical"
        offsetTop={0}
        xstyle={customStyles.custom}
        data-testid="sticky">
        <div data-testid="child">Test Content</div>
      </Sticky>,
    );

    const stickyElement = screen.getByTestId('sticky');
    expect(stickyElement.className).toContain('customStyles.custom');
  });
});
