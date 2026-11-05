// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Section} from './Section';

/**
 * The functional class output, as an order-insensitive set. StyleX's dev
 * runtime also emits readable debug classes naming the style object a
 * declaration came from ("padding__paddingBlockStyles.2"); those record
 * provenance rather than applied CSS and survive even when the declaration
 * they name loses a merge, so they are dropped here.
 */
function classSet(el: HTMLElement): Set<string> {
  return new Set(
    el.className
      .split(' ')
      .filter(Boolean)
      .filter(c => !c.includes('__') && !c.includes('.')),
  );
}

describe('Section', () => {
  it('renders with default props', () => {
    const {container} = render(<Section>Default section</Section>);
    expect(container.firstElementChild).toBeInTheDocument();
    expect(screen.getByText('Default section')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <Section>
        <span data-testid="child">Hello</span>
      </Section>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders with variant="section" (default)', () => {
    const {container} = render(<Section>Content</Section>);
    const inner = container.firstElementChild!.firstElementChild!;
    expect(inner.className).toContain('astryx-section');
    expect(inner).toHaveAttribute('data-variant', 'section');
  });

  it('renders with variant="transparent"', () => {
    const {container} = render(
      <Section variant="transparent">Content</Section>,
    );
    const inner = container.firstElementChild!.firstElementChild!;
    expect(inner.className).toContain('astryx-section');
    expect(inner).toHaveAttribute('data-variant', 'transparent');
  });

  it('renders with variant="muted"', () => {
    const {container} = render(<Section variant="muted">Content</Section>);
    const inner = container.firstElementChild!.firstElementChild!;
    expect(inner.className).toContain('astryx-section');
    expect(inner).toHaveAttribute('data-variant', 'muted');
  });

  it('renders with dividers', () => {
    const {container} = render(
      <Section dividers={['top', 'bottom']}>Content</Section>,
    );
    // The component should render without error
    expect(container.firstElementChild).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with padding prop', () => {
    const {container} = render(<Section padding={2}>Content</Section>);
    expect(container.firstElementChild).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with width and height without error', () => {
    const {container} = render(
      <Section width={400} height={300}>
        Content
      </Section>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeInTheDocument();
    // Sizing is applied via stylex dynamic styles (CSS custom properties)
    // which aren't reflected in element.style in test environments
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with maxWidth and minHeight without error', () => {
    const {container} = render(
      <Section maxWidth={600} minHeight={200}>
        Content
      </Section>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with string size values without error', () => {
    const {container} = render(
      <Section width="50%" height="auto">
        Content
      </Section>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLElement | null};
    render(<Section ref={ref}>Content</Section>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders astryx-* class names for theme targeting', () => {
    const {container} = render(<Section>Content</Section>);
    const inner = container.firstElementChild!.firstElementChild!;
    expect(inner.className).toContain('astryx-section');
  });

  it('renders variant in astryx class names', () => {
    const {container} = render(<Section variant="muted">Content</Section>);
    const inner = container.firstElementChild!.firstElementChild!;
    expect(inner.className).toContain('astryx-section');
    expect(inner).toHaveAttribute('data-variant', 'muted');
  });

  it('accepts xstyle prop without error', () => {
    // xstyle is a StyleXStyles type; in tests stylex.create returns objects
    // that may not produce runtime styles, but the prop should be accepted
    const {container} = render(<Section xstyle={undefined}>Content</Section>);
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it('accepts className prop', () => {
    const {container} = render(
      <Section className="custom-class">Content</Section>,
    );
    const root = container.firstElementChild!;
    expect(root.className).toContain('custom-class');
  });

  it('accepts style prop', () => {
    const {container} = render(
      <Section style={{opacity: 0.5}}>Content</Section>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.opacity).toBe('0.5');
  });

  it('has two-div structure (outer + inner)', () => {
    const {container} = render(<Section>Content</Section>);
    const outer = container.firstElementChild!;
    const inner = outer.firstElementChild!;
    expect(outer.tagName).toBe('DIV');
    expect(inner.tagName).toBe('DIV');
    // Children are inside the inner div
    expect(inner.textContent).toBe('Content');
  });

  it('spreads additional props', () => {
    render(<Section data-testid="custom-section">Content</Section>);
    expect(screen.getByTestId('custom-section')).toBeInTheDocument();
  });

  it('propagates explicit padding to nested sections via --_section-padding-propagated', () => {
    const {container} = render(
      <Section padding={6}>
        <Section data-testid="inner">Inner</Section>
      </Section>,
    );
    // The outer section's inner div announces its padding on the PRIVATE
    // propagation var, not the public `--astryx-section-padding` theme token —
    // the split is what lets an overlay drop an inherited value at its
    // boundary while keeping the theme's (see overlayPaddingReset).
    const outerInner = container.firstElementChild!
      .firstElementChild! as HTMLElement;
    expect(
      getComputedStyle(outerInner).getPropertyValue(
        '--_section-padding-propagated',
      ),
      // jsdom does not resolve the token reference to its 24px value.
    ).toBe('var(--spacing-6)');
    expect(
      getComputedStyle(outerInner).getPropertyValue('--astryx-section-padding'),
    ).toBe('');
    // Inner section should render without error
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    expect(screen.getByText('Inner')).toBeInTheDocument();
  });

  it('renders nested sections with explicit inner padding override', () => {
    render(
      <Section padding={6}>
        <Section padding={2} data-testid="inner">
          Inner
        </Section>
      </Section>,
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    expect(screen.getByText('Inner')).toBeInTheDocument();
  });

  it('applies a class when paddingBlockStart is set on its own', () => {
    const {container, rerender} = render(<Section>Content</Section>);
    const baseline = (
      container.firstElementChild!.firstElementChild as HTMLElement
    ).className;
    rerender(<Section paddingBlockStart={2}>Content</Section>);
    const withEdge = (
      container.firstElementChild!.firstElementChild as HTMLElement
    ).className;
    expect(withEdge).not.toBe(baseline);
  });

  it('treats paddingBlock as the two edge props set to the same step', () => {
    const {container, rerender} = render(
      <Section paddingBlock={2}>Content</Section>,
    );
    const axis = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section paddingBlockStart={2} paddingBlockEnd={2}>
        Content
      </Section>,
    );
    expect(axis).toEqual(
      classSet(container.firstElementChild!.firstElementChild as HTMLElement),
    );
  });

  it('gives paddingBlockEnd precedence over paddingBlock', () => {
    const {container, rerender} = render(
      <Section paddingBlock={2} paddingBlockEnd={8}>
        Content
      </Section>,
    );
    const overridden = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section paddingBlockStart={2} paddingBlockEnd={8}>
        Content
      </Section>,
    );
    expect(overridden).toEqual(
      classSet(container.firstElementChild!.firstElementChild as HTMLElement),
    );
  });

  it('keeps inline padding when only a block edge is overridden', () => {
    // padding={6} sets all four edges; paddingBlockStart={0} may only move the
    // top edge, so the inline classes must survive unchanged.
    const {container, rerender} = render(
      <Section padding={6}>Content</Section>,
    );
    const uniform = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section padding={6} paddingBlockStart={0}>
        Content
      </Section>,
    );
    const overridden = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    // Everything the uniform render dropped is block-start related.
    const removed = [...uniform].filter(c => !overridden.has(c));
    const added = [...overridden].filter(c => !uniform.has(c));
    expect(removed.length).toBeGreaterThan(0);
    expect(added.length).toBeGreaterThan(0);
    // The inline-axis classes are shared by both renders.
    expect(uniform.size - removed.length).toBeGreaterThan(0);
  });

  it('applies a class when paddingInlineStart is set on its own', () => {
    const {container, rerender} = render(<Section>Content</Section>);
    const baseline = (
      container.firstElementChild!.firstElementChild as HTMLElement
    ).className;
    rerender(<Section paddingInlineStart={2}>Content</Section>);
    expect(
      (container.firstElementChild!.firstElementChild as HTMLElement).className,
    ).not.toBe(baseline);
  });

  it('treats paddingInline as the two inline edge props set to the same step', () => {
    const {container, rerender} = render(
      <Section paddingInline={2}>Content</Section>,
    );
    const axis = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section paddingInlineStart={2} paddingInlineEnd={2}>
        Content
      </Section>,
    );
    expect(axis).toEqual(
      classSet(container.firstElementChild!.firstElementChild as HTMLElement),
    );
  });

  it('gives paddingInlineEnd precedence over paddingInline', () => {
    const {container, rerender} = render(
      <Section paddingInline={2} paddingInlineEnd={8}>
        Content
      </Section>,
    );
    const overridden = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section paddingInlineStart={2} paddingInlineEnd={8}>
        Content
      </Section>,
    );
    expect(overridden).toEqual(
      classSet(container.firstElementChild!.firstElementChild as HTMLElement),
    );
  });

  it('keeps block padding when only an inline edge is overridden', () => {
    const {container, rerender} = render(
      <Section padding={6}>Content</Section>,
    );
    const uniform = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section padding={6} paddingInlineStart={0}>
        Content
      </Section>,
    );
    const overridden = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    const removed = [...uniform].filter(c => !overridden.has(c));
    const added = [...overridden].filter(c => !uniform.has(c));
    expect(removed.length).toBeGreaterThan(0);
    expect(added.length).toBeGreaterThan(0);
    // The block-axis classes survive the inline-edge override.
    expect(uniform.size - removed.length).toBeGreaterThan(0);
  });

  it('moves the inline container vars with a per-edge override', () => {
    // Section drives --container-padding-inline-start/end for bleed children.
    // A per-edge override must move only the matching var, so a nested Section
    // or a bleeding Divider compensates against the real padding.
    const {container, rerender} = render(
      <Section padding={6} paddingInlineStart={2}>
        Content
      </Section>,
    );
    const startOverride = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    rerender(
      <Section padding={6} paddingInlineEnd={2}>
        Content
      </Section>,
    );
    const endOverride = classSet(
      container.firstElementChild!.firstElementChild as HTMLElement,
    );
    // Overriding opposite edges by the same step must not produce identical
    // output — each edge carries its own padding class and its own var class.
    expect(startOverride).not.toEqual(endOverride);
  });
});
