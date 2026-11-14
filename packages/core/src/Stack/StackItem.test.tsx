// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file StackItem.test.tsx
 * @input Uses vitest, @testing-library/react, StackItem component
 * @output Unit tests for StackItem component behavior
 * @position Testing; validates StackItem.tsx implementation
 *
 * SYNC: When StackItem.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {StackItem} from './StackItem';

describe('StackItem', () => {
  it('renders children correctly', () => {
    render(<StackItem>Test content</StackItem>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders as div by default', () => {
    render(<StackItem data-testid="stack-item">Content</StackItem>);
    const element = screen.getByTestId('stack-item');
    expect(element.tagName).toBe('DIV');
  });

  it('renders with polymorphic as prop', () => {
    render(
      <StackItem as="section" data-testid="stack-item">
        Content
      </StackItem>,
    );
    const element = screen.getByTestId('stack-item');
    expect(element.tagName).toBe('SECTION');
  });

  it('renders with size prop', () => {
    render(<StackItem size="fill">Content</StackItem>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with static size', () => {
    render(<StackItem size="static">Content</StackItem>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with crossAlignSelf prop', () => {
    render(<StackItem crossAlignSelf="center">Content</StackItem>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <StackItem ref={ref}>
        <div>Test</div>
      </StackItem>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('forwards ref with polymorphic as', () => {
    const ref = vi.fn();
    render(
      <StackItem as="section" ref={ref}>
        <div>Test</div>
      </StackItem>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes through additional props', () => {
    render(
      <StackItem data-testid="stack-item" aria-label="Stack item">
        Content
      </StackItem>,
    );
    const element = screen.getByTestId('stack-item');
    expect(element).toHaveAttribute('aria-label', 'Stack item');
  });

  it('applies an overflow class when isScrollable is set', () => {
    const {rerender} = render(
      <StackItem data-testid="stack-item">Content</StackItem>,
    );
    const withoutScroll = screen.getByTestId('stack-item').className;
    rerender(
      <StackItem isScrollable data-testid="stack-item">
        Content
      </StackItem>,
    );
    const withScroll = screen.getByTestId('stack-item').className;
    expect(withScroll).not.toBe(withoutScroll);
  });

  it('composes isScrollable with size="fill"', () => {
    render(
      <StackItem size="fill" isScrollable data-testid="stack-item">
        Content
      </StackItem>,
    );
    expect(screen.getByTestId('stack-item').className).not.toBe('');
  });
});

/**
 * `minWidth` (issue #2623): the floor for a `size="fill"` column, so a
 * multi-pane strip holds each pane at its minimum and scrolls instead of
 * squeezing it.
 */
describe('StackItem minWidth', () => {
  it('floors a fill item at minWidth', () => {
    render(
      <StackItem size="fill" minWidth={320} data-testid="stack-item">
        Content
      </StackItem>,
    );
    const computed = getComputedStyle(screen.getByTestId('stack-item'));
    expect(computed.flexGrow).toBe('1');
    expect(computed.minWidth).toBe('320px');
  });

  it('accepts a string minWidth', () => {
    render(
      <StackItem minWidth="50%" data-testid="stack-item">
        Content
      </StackItem>,
    );
    expect(getComputedStyle(screen.getByTestId('stack-item')).minWidth).toBe(
      '50%',
    );
  });

  it('keeps the flex min-height reset when minWidth is set', () => {
    // minWidth replaces only the min-width half of the flex min-size reset;
    // the item must still be able to shrink (and scroll) on the cross axis.
    render(
      <StackItem size="fill" minWidth={320} data-testid="stack-item">
        Content
      </StackItem>,
    );
    expect(getComputedStyle(screen.getByTestId('stack-item')).minHeight).toBe(
      '0',
    );
  });

  it('keeps the flex min-width reset when minWidth is unset', () => {
    render(<StackItem data-testid="stack-item">Content</StackItem>);
    expect(getComputedStyle(screen.getByTestId('stack-item')).minWidth).toBe(
      '0',
    );
  });

  it('does not leak minWidth to the DOM', () => {
    render(
      <StackItem minWidth={320} data-testid="stack-item">
        Content
      </StackItem>,
    );
    expect(screen.getByTestId('stack-item').hasAttribute('minwidth')).toBe(
      false,
    );
  });
});
