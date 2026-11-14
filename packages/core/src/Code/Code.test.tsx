// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Code.test.tsx
 * @input Uses vitest, @testing-library/react, Code component
 * @output Unit tests for Code component behavior
 * @position Testing; validates Code.tsx implementation
 *
 * SYNC: When Code.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {Code} from './Code';

const testStyles = stylex.create({
  root: {
    marginTop: 1,
  },
});

describe('Code', () => {
  it('renders children inside a <code> element', () => {
    render(<Code>const x = 1</Code>);
    const el = screen.getByText('const x = 1');
    expect(el.tagName).toBe('CODE');
  });

  it('reads left to right in right-to-left prose, and keeps a caller dir', () => {
    render(
      <p dir="rtl">
        <Code>const a = 1;</Code> <Code dir="auto">other</Code>
      </p>,
    );
    expect(screen.getByText('const a = 1;')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('other')).toHaveAttribute('dir', 'auto');
  });

  it('forwards ref to the root element', () => {
    const ref = vi.fn();
    render(<Code ref={ref}>code</Code>);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('defaults color to primary', () => {
    render(<Code>code</Code>);
    expect(screen.getByText('code')).toHaveClass('astryx-code');
    expect(screen.getByText('code')).toHaveAttribute('data-color', 'primary');
  });

  it('applies the secondary color', () => {
    render(<Code color="secondary">code</Code>);
    expect(screen.getByText('code')).toHaveClass('astryx-code');
    expect(screen.getByText('code')).toHaveAttribute('data-color', 'secondary');
  });

  it('applies the inherit color', () => {
    render(<Code color="inherit">code</Code>);
    expect(screen.getByText('code')).toHaveClass('astryx-code');
    expect(screen.getByText('code')).toHaveAttribute('data-color', 'inherit');
  });

  it('reflects an inherited size on the code target', () => {
    render(<Code size="inherit">code</Code>);
    expect(screen.getByText('code')).toHaveClass('astryx-code');
    expect(screen.getByText('code')).toHaveAttribute('data-size', 'inherit');
  });

  it('reflects no size when size is omitted', () => {
    render(<Code>code</Code>);
    expect(screen.getByText('code')).not.toHaveAttribute('data-size');
  });

  it('forwards supported root props and composes styling inputs', () => {
    render(
      <Code
        aria-label="Code sample"
        className="consumer-class"
        data-testid="code"
        style={{opacity: 0.5}}
        xstyle={testStyles.root}>
        code
      </Code>,
    );

    const element = screen.getByTestId('code');
    const xstyleClassName = stylex.props(testStyles.root).className;

    expect(element).toHaveAttribute('aria-label', 'Code sample');
    expect(element).toHaveClass('consumer-class');
    expect(xstyleClassName).toBeTypeOf('string');
    expect(element).toHaveClass(xstyleClassName as string);
    expect(element).toHaveStyle({opacity: '0.5'});
  });
});
