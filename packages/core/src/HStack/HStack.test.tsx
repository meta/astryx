// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HStack.test.tsx
 * @input Uses vitest, @testing-library/react, React, HStack and Stack components
 * @output Unit tests for HStack component behavior
 * @position Testing; validates HStack.tsx implementation
 *
 * SYNC: When HStack.tsx changes, update tests to match new behavior
 */

import {createRef, type ReactElement} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Stack} from '../Stack/Stack';
import {HStack} from './HStack';

function classNameOf(element: ReactElement): string {
  const {container, unmount} = render(element);
  const className = (container.firstElementChild as HTMLElement).className;
  unmount();
  return className;
}

describe('HStack', () => {
  it('renders children correctly', () => {
    render(
      <HStack>
        <div>Item 1</div>
        <div>Item 2</div>
      </HStack>,
    );
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('renders as div by default', () => {
    render(<HStack data-testid="hstack">Content</HStack>);
    const element = screen.getByTestId('hstack');
    expect(element.tagName).toBe('DIV');
  });

  it('renders with polymorphic as prop', () => {
    render(
      <HStack as="nav" data-testid="hstack">
        Content
      </HStack>,
    );
    const element = screen.getByTestId('hstack');
    expect(element.tagName).toBe('NAV');
  });

  it('renders a horizontal stack that carries the stack target', () => {
    render(
      <HStack gap={4} wrap="wrap" data-testid="hstack">
        <div>Item</div>
      </HStack>,
    );
    const element = screen.getByTestId('hstack');
    expect(element).toHaveClass('astryx-stack');
    expect(element).toHaveAttribute('data-direction', 'horizontal');
    expect(element).toHaveAttribute('data-gap', '4');
    expect(element).toHaveAttribute('data-wrap', 'wrap');
  });

  it('sets the main axis with hAlign and the cross axis with vAlign, as Stack does for a horizontal stack', () => {
    expect(classNameOf(<HStack hAlign="center" />)).toBe(
      classNameOf(<Stack direction="horizontal" justify="center" />),
    );
    expect(classNameOf(<HStack vAlign="center" />)).toBe(
      classNameOf(<Stack direction="horizontal" align="center" />),
    );
    expect(classNameOf(<HStack hAlign="center" />)).not.toBe(
      classNameOf(<HStack vAlign="center" />),
    );
  });

  it('applies justify and align as aliases for hAlign and vAlign', () => {
    expect(classNameOf(<HStack justify="between" />)).toBe(
      classNameOf(<HStack hAlign="between" />),
    );
    expect(classNameOf(<HStack align="end" />)).toBe(
      classNameOf(<HStack vAlign="end" />),
    );
    expect(classNameOf(<HStack justify="between" />)).not.toBe(
      classNameOf(<HStack />),
    );
    expect(classNameOf(<HStack align="end" />)).not.toBe(
      classNameOf(<HStack />),
    );
  });

  it('lets an explicit hAlign or vAlign win over its alias', () => {
    expect(classNameOf(<HStack hAlign="center" justify="end" />)).toBe(
      classNameOf(<HStack hAlign="center" />),
    );
    expect(classNameOf(<HStack vAlign="start" align="end" />)).toBe(
      classNameOf(<HStack vAlign="start" />),
    );
  });

  it('forwards ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(
      <HStack ref={ref} as="section" data-testid="hstack">
        <div>Test</div>
      </HStack>,
    );
    expect(ref.current).toBe(screen.getByTestId('hstack'));
  });

  it('passes ARIA and data attributes to the rendered element', () => {
    render(
      <HStack aria-label="Toolbar row" data-testid="hstack">
        <div>Item</div>
      </HStack>,
    );
    expect(screen.getByTestId('hstack')).toHaveAttribute(
      'aria-label',
      'Toolbar row',
    );
  });

  it('merges className and style, with sizing props after style', () => {
    render(
      <HStack
        data-testid="hstack"
        className="caller-row"
        style={{color: 'red', width: 10}}
        width={300}>
        <div>Item</div>
      </HStack>,
    );
    const element = screen.getByTestId('hstack');
    expect(element).toHaveClass('astryx-stack');
    expect(element).toHaveClass('caller-row');
    expect(element.style.color).toBe('red');
    expect(element.style.width).toBe('300px');
  });

  it('adds no role and no tab stop of its own', () => {
    render(
      <HStack data-testid="hstack">
        <div>Item</div>
      </HStack>,
    );
    const element = screen.getByTestId('hstack');
    expect(element).not.toHaveAttribute('role');
    expect(element).not.toHaveAttribute('tabindex');
  });
});
