// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {act, render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {StyleXStyles} from '@stylexjs/stylex';
import {getAllInjectedCss} from '../__tests__/forcedColors';
import {
  containerPaddingBlockEndVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingInlineEndVarStyles,
  containerPaddingInlineStartVarStyles,
  paddingBlockEndStyles,
  paddingBlockStartStyles,
  paddingInlineEndStyles,
  paddingInlineStartStyles,
} from '../Layout/padding.stylex';
import {ScrollableArea} from './ScrollableArea';

/**
 * Atomic (hashed) class names for a style, excluding dev-mode debug names —
 * two style maps declaring the same property/value share the hash atom, so
 * these tokens are comparable across maps while debug names are not. Accepts
 * the custom-property var styles, whose entries are not typed as StyleXStyles.
 */
function classTokens(style: object): string[] {
  return (stylex.props(style as StyleXStyles).className ?? '')
    .split(' ')
    .filter(token => token && !token.includes('__'));
}

/** Each logical edge's applied padding atom and published inset variable. */
const PADDING_EDGES = [
  [paddingInlineStartStyles, containerPaddingInlineStartVarStyles],
  [paddingInlineEndStyles, containerPaddingInlineEndVarStyles],
  [paddingBlockStartStyles, containerPaddingBlockStartVarStyles],
  [paddingBlockEndStyles, containerPaddingBlockEndVarStyles],
] as const;

function setGeometry(
  element: HTMLElement,
  values: Partial<
    Pick<
      HTMLElement,
      'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight'
    >
  >,
) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

describe('ScrollableArea', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn(function () {
        return {observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn()};
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function flushFrame() {
    void act(() => {
      const pending = frames.splice(0);
      pending.forEach(callback => callback(performance.now()));
    });
  }

  it('renders one native viewport and one real content box', () => {
    render(
      <ScrollableArea label="Messages" data-testid="viewport">
        <p>Message history</p>
      </ScrollableArea>,
    );

    const viewport = screen.getByTestId('viewport');
    expect(viewport).toHaveAccessibleName('Messages');
    expect(viewport).toHaveAttribute('role', 'group');
    expect(viewport).toHaveAttribute('data-scroll-axis', 'block');
    expect(viewport).not.toHaveAttribute('tabindex');
    expect(viewport.children).toHaveLength(1);
    expect(viewport.firstElementChild).toHaveAttribute('data-scroll-content');
    expect(viewport).toHaveTextContent('Message history');
  });

  it('becomes keyboard reachable only when the requested axis is effective', () => {
    render(
      <ScrollableArea
        axis="block"
        label="Messages"
        data-testid="viewport"
        style={{height: 100}}>
        <p>Message history</p>
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    // jsdom does not resolve StyleX's dynamic CSS variables. Mirror the
    // generated class values so this integration test can exercise measurement.
    viewport.style.overflowX = 'hidden';
    viewport.style.overflowY = 'auto';
    setGeometry(viewport, {
      clientWidth: 100,
      clientHeight: 100,
      scrollWidth: 100,
      scrollHeight: 180,
    });

    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveAttribute('data-scrollable-block', 'true');

    setGeometry(viewport, {scrollHeight: 100});
    void act(() => viewport.focus());
    void act(() => viewport.dispatchEvent(new Event('scroll')));
    flushFrame();
    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(viewport);
  });

  it('keeps viewport props, styles, class names, events, and refs', () => {
    const onClick = vi.fn();
    const ref = vi.fn();
    render(
      <ScrollableArea
        label="Results"
        role="region"
        ref={ref}
        onClick={onClick}
        className="consumer-class"
        style={{maxHeight: 200}}
        data-testid="viewport">
        Results
      </ScrollableArea>,
    );

    const viewport = screen.getByTestId('viewport');
    viewport.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledWith(viewport);
    expect(viewport).toHaveClass('astryx-scrollable-area', 'consumer-class');
    expect(viewport.style.maxHeight).toBe('200px');
    expect(viewport).toHaveAttribute('role', 'region');
  });

  it('reflects logical axis and chaining intent without containing a fitting area', () => {
    render(
      <ScrollableArea
        axis="both"
        label="Canvas"
        overscroll="contain"
        data-testid="viewport">
        Canvas
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    expect(viewport).toHaveAttribute('data-axis', 'both');
    expect(viewport).toHaveAttribute('data-scroll-axis', 'both');
    expect(viewport.style.overscrollBehaviorX).toBe('auto');
    expect(viewport.style.overscrollBehaviorY).toBe('auto');
  });

  it('keeps logical overflow and content sizing for writing-mode changes', () => {
    const {rerender} = render(
      <ScrollableArea axis="inline" label="Timeline" data-testid="viewport">
        Timeline
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    const content = viewport.firstElementChild as HTMLElement;
    expect(viewport).toHaveAttribute('data-axis', 'inline');
    expect(viewport.style.overflowInline).toBe('');
    expect(viewport.style.overflowBlock).toBe('');
    const inlineContentClass = content.className;
    expect(content.style.inlineSize).toBe('');
    expect(content.style.minInlineSize).toBe('');

    rerender(
      <ScrollableArea axis="block" label="Timeline" data-testid="viewport">
        Timeline
      </ScrollableArea>,
    );
    expect(viewport).toHaveAttribute('data-axis', 'block');
    expect(viewport.style.overflowInline).toBe('');
    expect(viewport.style.overflowBlock).toBe('');
    expect(content.className).not.toBe(inlineContentClass);
    expect(content.style.inlineSize).toBe('');
    const source = stylesSource();
    expect(source).not.toContain('dynamicStyles.overflow(');
    expect(source).not.toContain('logicalOverflowStyle');
    expect(hookSource()).toContain('styles.overflow(');
    expect(source).toContain("minInlineSize: '100%'");
    expect(source).toContain("inlineSize: 'max-content'");
  });

  it('uses clip while fitting and makes fitting Sticky containment explicit', () => {
    const {rerender} = render(
      <ScrollableArea label="Messages" data-testid="viewport">
        Messages
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    expect(viewport.getAttribute('style')).toContain('clip');
    expect(viewport).not.toHaveAttribute('tabindex');

    rerender(
      <ScrollableArea
        label="Messages"
        stickyContainment="always"
        data-testid="viewport">
        Messages
      </ScrollableArea>,
    );
    expect(viewport.getAttribute('style')).toContain('--x-overflowX: hidden');
    expect(viewport.getAttribute('style')).toContain('--x-overflowY: auto');
    expect(viewport).not.toHaveAttribute('tabindex');
  });

  it('accepts standard container sizing props on the viewport', () => {
    render(
      <ScrollableArea
        label="Messages"
        width={320}
        height="50vh"
        maxWidth="100%"
        minHeight={120}
        data-testid="viewport">
        Messages
      </ScrollableArea>,
    );

    expect(screen.getByTestId('viewport')).toBeInTheDocument();
    expect(stylesSource()).toContain('dynamicStyles.sizing(');
  });

  it('publishes content padding without changing the viewport default', () => {
    const {rerender} = render(
      <ScrollableArea label="Messages" data-testid="viewport">
        Messages
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    const content = viewport.firstElementChild as HTMLElement;
    const defaultViewportClass = viewport.className;
    const defaultContentClass = content.className;

    rerender(
      <ScrollableArea
        label="Messages"
        padding={4}
        paddingInlineEnd={2}
        data-testid="viewport">
        Messages
      </ScrollableArea>,
    );

    expect(viewport.className).toBe(defaultViewportClass);
    expect(content.className).not.toBe(defaultContentClass);
    const source = stylesSource();
    expect(source).toContain('containerPaddingInlineVarStyles[padding]');
    expect(source).toContain(
      'containerPaddingInlineEndVarStyles[paddingInlineEnd]',
    );
  });

  it.each([
    {name: 'zero on every edge by default', props: {}, edges: [0, 0, 0, 0]},
    {
      name: 'uniform padding on every edge',
      props: {padding: 4},
      edges: [4, 4, 4, 4],
    },
    {
      name: 'zero axis values over uniform',
      props: {padding: 4, paddingInline: 0, paddingBlock: 0},
      edges: [0, 0, 0, 0],
    },
    {
      name: 'start edges over axis over uniform',
      props: {
        padding: 4,
        paddingInline: 3,
        paddingBlock: 2,
        paddingInlineStart: 0,
        paddingBlockStart: 0,
      },
      edges: [0, 3, 0, 2],
    },
    {
      name: 'end edges over axis over uniform',
      props: {
        padding: 4,
        paddingInline: 3,
        paddingBlock: 2,
        paddingInlineEnd: 0,
        paddingBlockEnd: 0,
      },
      edges: [3, 0, 2, 0],
    },
  ] as const)('applies and publishes $name', ({props, edges}) => {
    render(
      <ScrollableArea label="Messages" data-testid="viewport" {...props}>
        Messages
      </ScrollableArea>,
    );
    const content = screen.getByTestId('viewport')
      .firstElementChild as HTMLElement;
    const contentClasses = new Set(content.className.split(' '));

    // StyleX keeps one atom per property, so the winning atom being present
    // means every overridden one was dropped.
    PADDING_EDGES.forEach(([atoms, inset], index) => {
      for (const style of [atoms[edges[index]], inset[edges[index]]]) {
        const tokens = classTokens(style);
        expect(tokens.length).toBeGreaterThan(0);
        for (const token of tokens) {
          expect(contentClasses).toContain(token);
        }
      }
    });
  });

  it('keeps inherited container bleed opt-in on the viewport', () => {
    const {rerender} = render(
      <ScrollableArea label="Messages" data-testid="viewport">
        Messages
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    const containedClass = viewport.className;

    rerender(
      <ScrollableArea label="Messages" isFullBleed data-testid="viewport">
        Messages
      </ScrollableArea>,
    );

    expect(viewport.className).not.toBe(containedClass);
    const source = stylesSource();
    expect(source).toContain('var(--container-padding-inline-start, 0px)');
    expect(source).toContain('isFullBleed && styles.fullBleed');
  });

  it('uses the neutral token for native scrollbar color with a transparent track', () => {
    render(
      <ScrollableArea label="Messages" data-testid="viewport">
        Messages
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    const css = getAllInjectedCss();
    // Anchor every assertion to a class the rendered viewport carries --
    // runtime injection emits rules for unused styles too, so an unanchored
    // match would pass even if the viewport stopped composing these styles.
    const thumbRules = [
      ...css.matchAll(/\.([\w-]+)[^{]*\{[^{}]*scrollbar-color:([^;{}]*);/g),
    ].filter(match => viewport.classList.contains(match[1]));
    expect(
      thumbRules.some(
        match => match[2].trim() === 'var(--color-neutral) transparent',
      ),
    ).toBe(true);
    const forcedRules = [
      ...css.matchAll(
        /@media \(forced-colors:\s*active\)\s*\{\s*\.([\w-]+)[^{]*\{[^{}]*scrollbar-color:\s*auto/g,
      ),
    ];
    expect(
      forcedRules.some(match => viewport.classList.contains(match[1])),
    ).toBe(true);
  });

  it("keeps the platform's own scroll indicator on touch screens", () => {
    const source = stylesSource();
    expect(source).toContain("'@media (pointer: coarse)': 'auto'");
  });

  it('guards scroll-state query containment as a progressive enhancement', () => {
    render(
      <ScrollableArea label="Messages" data-testid="viewport">
        Messages
      </ScrollableArea>,
    );
    const viewport = screen.getByTestId('viewport');
    const css = getAllInjectedCss();
    // The guarded rule must declare `container-type: scroll-state` INSIDE the
    // @supports block (a mutated declaration keeps the condition text), on a
    // class the rendered viewport actually carries (runtime injection emits
    // rules for unused styles too).
    const guarded = [
      ...css.matchAll(
        /@supports \(container-type:\s*scroll-state\)\s*\{\s*\.([\w-]+)[^{]*\{[^{}]*container-type:\s*scroll-state\s*;/g,
      ),
    ];
    expect(guarded.some(match => viewport.classList.contains(match[1]))).toBe(
      true,
    );
  });
});

function hookSource(): string {
  return readFileSync('packages/core/src/hooks/useScrollableArea.ts', 'utf8');
}

function stylesSource(): string {
  // This focused source assertion complements the built-CSS browser probe: it
  // keeps the capability guard and token reference reviewable at unit-test speed.
  return readFileSync(
    'packages/core/src/ScrollableArea/ScrollableArea.tsx',
    'utf8',
  );
}
