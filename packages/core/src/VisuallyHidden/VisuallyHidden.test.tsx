// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VisuallyHidden.test.tsx
 * @input Uses vitest, @testing-library/react, VisuallyHidden component
 * @output Unit tests for VisuallyHidden rendering + a11y behavior
 * @position Testing; validates VisuallyHidden.tsx implementation
 *
 * SYNC: When VisuallyHidden.tsx changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {createRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VisuallyHidden} from './VisuallyHidden';

describe('VisuallyHidden', () => {
  it('renders its children in the accessibility tree', () => {
    render(<VisuallyHidden>Delete incident</VisuallyHidden>);
    // Present in the a11y tree (getByText finds it — it is not display:none).
    expect(screen.getByText('Delete incident')).toBeInTheDocument();
  });

  it('renders a <span> by default', () => {
    render(<VisuallyHidden>Label</VisuallyHidden>);
    expect(screen.getByText('Label').tagName).toBe('SPAN');
  });

  it('renders a custom element via the `as` prop', () => {
    render(
      <VisuallyHidden as="div" aria-live="polite">
        Moved task to Done
      </VisuallyHidden>,
    );
    const el = screen.getByText('Moved task to Done');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('applies the clip styles that hide it visually', () => {
    render(<VisuallyHidden>Hidden</VisuallyHidden>);
    const el = screen.getByText('Hidden');
    // jsdom does not apply the stylesheet, but the StyleX class is attached.
    expect(el.getAttribute('class')).toBeTruthy();
    // It must NOT be display:none / hidden — it stays in the a11y tree.
    expect(el).not.toHaveAttribute('hidden');
  });

  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(<VisuallyHidden ref={ref}>Ref target</VisuallyHidden>);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.textContent).toBe('Ref target');
  });

  it('passes through arbitrary BaseProps (id, role, data-*)', () => {
    render(
      <VisuallyHidden id="announcer" role="status" data-testid="vh">
        Status
      </VisuallyHidden>,
    );
    const el = screen.getByTestId('vh');
    expect(el).toHaveAttribute('id', 'announcer');
    expect(el).toHaveAttribute('role', 'status');
  });

  it('does not forward the styling props its own contract omits', () => {
    // `className` and `style` are off the interface, and they are reached here
    // through an untyped spread, which is how they get past the `Omit` in
    // practice: a cast, a `{...consumerProps}` object, or plain JavaScript. The
    // type is only the first line of defence here.
    const stylingProps: Record<string, unknown> = {
      xstyle: {color: 'red'},
      className: 'consumer-track',
      style: {position: 'static'},
    };
    render(<VisuallyHidden {...stylingProps}>Hidden</VisuallyHidden>);
    const el = screen.getByText('Hidden');

    // VisuallyHidden documents itself as styling-free and its clip block as
    // non-overridable, but the implementation spreads leftover props onto the
    // element: `xstyle` reaches the DOM as the literal string "[object Object]",
    // and a cast `style` wins the last-word race for `position`, un-hiding the
    // node (or clipping real content) while keeping the a11y semantics.
    expect(el).not.toHaveAttribute('xstyle');
    expect(el.getAttribute('class') ?? '').not.toContain('consumer-track');
    expect(el.getAttribute('style') ?? '').not.toContain('static');
  });

  it('still accepts a typed xstyle, and ignores it', () => {
    // Released 0.7.2 accepted `xstyle` through `BaseProps`, so narrowing it out
    // of `VisuallyHiddenProps` would make code that compiles today stop
    // compiling. It stays declared and documented as ignored, and the runtime
    // drop is what keeps the stray attribute off the element. Written as a typed
    // prop on purpose: this line is the tripwire if the interface is ever
    // narrowed early.
    const overrides = stylex.create({tint: {color: 'red'}});
    render(<VisuallyHidden xstyle={overrides.tint}>Hidden</VisuallyHidden>);
    const el = screen.getByText('Hidden');

    expect(el).not.toHaveAttribute('xstyle');
    expect(el.getAttribute('style') ?? '').not.toContain('color');
  });

  it('gives an icon-only control an accessible name', () => {
    render(
      <button type="button">
        <span aria-hidden="true">🗑️</span>
        <VisuallyHidden>Delete</VisuallyHidden>
      </button>,
    );
    expect(screen.getByRole('button', {name: 'Delete'})).toBeInTheDocument();
  });
});
