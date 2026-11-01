// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Heading.test.tsx
 * Tests for Heading component
 */

import {render, screen} from '@testing-library/react';
import {describe, it, expect, vi} from 'vitest';
import {Heading} from './Heading';

declare module './index' {
  interface HeadingTypeMap {
    hero: true;
  }
}

describe('Heading', () => {
  describe('rendering', () => {
    it('renders children correctly', () => {
      render(<Heading level={1}>Page Title</Heading>);
      expect(screen.getByText('Page Title')).toBeInTheDocument();
    });

    it('keeps a forwarded ref attached across rerenders', () => {
      const ref = vi.fn();
      const {rerender} = render(
        <Heading ref={ref} level={1}>
          Before
        </Heading>,
      );

      const element = screen.getByText('Before');
      expect(ref).toHaveBeenLastCalledWith(element);
      ref.mockClear();

      rerender(
        <Heading ref={ref} level={1}>
          After
        </Heading>,
      );

      expect(ref).not.toHaveBeenCalled();
      expect(screen.getByText('After')).toBe(element);
    });

    it('renders h1 for level 1', () => {
      render(<Heading level={1}>H1</Heading>);
      const element = screen.getByText('H1');
      expect(element.tagName).toBe('H1');
    });

    it('renders h2 for level 2', () => {
      render(<Heading level={2}>H2</Heading>);
      const element = screen.getByText('H2');
      expect(element.tagName).toBe('H2');
    });

    it('renders h3 for level 3', () => {
      render(<Heading level={3}>H3</Heading>);
      const element = screen.getByText('H3');
      expect(element.tagName).toBe('H3');
    });

    it('renders h4 for level 4', () => {
      render(<Heading level={4}>H4</Heading>);
      const element = screen.getByText('H4');
      expect(element.tagName).toBe('H4');
    });

    it('renders h5 for level 5', () => {
      render(<Heading level={5}>H5</Heading>);
      const element = screen.getByText('H5');
      expect(element.tagName).toBe('H5');
    });

    it('renders h6 for level 6', () => {
      render(<Heading level={6}>H6</Heading>);
      const element = screen.getByText('H6');
      expect(element.tagName).toBe('H6');
    });
  });

  describe('props', () => {
    it('forwards additional props', () => {
      render(
        <Heading level={1} data-testid="custom-heading">
          Title
        </Heading>,
      );
      expect(screen.getByTestId('custom-heading')).toBeInTheDocument();
    });

    it('supports id', () => {
      render(
        <Heading level={2} id="section-title">
          Section
        </Heading>,
      );
      const element = screen.getByText('Section');
      expect(element).toHaveAttribute('id', 'section-title');
    });

    it('accepts color prop', () => {
      render(
        <Heading level={1} color="secondary">
          Secondary heading
        </Heading>,
      );
      expect(screen.getByText('Secondary heading')).toBeInTheDocument();
    });

    it('accepts display prop', () => {
      render(
        <Heading level={1} display="inline">
          Inline heading
        </Heading>,
      );
      expect(screen.getByText('Inline heading')).toBeInTheDocument();
    });

    it('accepts hasStrikethrough prop', () => {
      render(
        <Heading level={1} hasStrikethrough>
          Strikethrough heading
        </Heading>,
      );
      expect(screen.getByText('Strikethrough heading')).toBeInTheDocument();
    });

    it('accepts hasCapsize prop', () => {
      render(
        <Heading level={1} hasCapsize>
          Capsize heading
        </Heading>,
      );
      expect(screen.getByText('Capsize heading')).toBeInTheDocument();
    });

    it('accepts textWrap prop', () => {
      render(
        <Heading level={1} textWrap="balance">
          Balanced heading
        </Heading>,
      );
      expect(screen.getByText('Balanced heading')).toBeInTheDocument();
    });

    it('accepts maxLines prop', () => {
      render(
        <Heading level={1} maxLines={1}>
          Very long heading that should be truncated
        </Heading>,
      );
      expect(
        screen.getByText('Very long heading that should be truncated'),
      ).toBeInTheDocument();
    });

    it('accepts wordBreak prop', () => {
      render(
        <Heading level={1} maxLines={1} wordBreak="break-word">
          Heading with word break
        </Heading>,
      );
      expect(screen.getByText('Heading with word break')).toBeInTheDocument();
    });

    it('accepts hasTruncateTooltip=false to disable tooltip', () => {
      render(
        <Heading level={1} maxLines={1} hasTruncateTooltip={false}>
          No tooltip
        </Heading>,
      );
      expect(screen.getByText('No tooltip')).toBeInTheDocument();
    });

    it('accepts accessibilityLevel prop', () => {
      render(
        <Heading level={2} accessibilityLevel={3}>
          Sidebar Section
        </Heading>,
      );
      const element = screen.getByText('Sidebar Section');
      expect(element).toHaveAttribute('aria-level', '3');
      expect(element.tagName).toBe('H2');
    });

    it('accepts type prop for display variants', () => {
      render(
        <Heading level={1} type="display-1">
          Hero Title
        </Heading>,
      );
      const element = screen.getByText('Hero Title');
      expect(element.tagName).toBe('H1');
    });

    it('renders correct heading element with display type', () => {
      render(
        <Heading level={2} type="display-2">
          Revenue
        </Heading>,
      );
      const element = screen.getByText('Revenue');
      expect(element.tagName).toBe('H2');
    });

    it('reflects a display type as a data attribute', () => {
      render(
        <Heading level={1} type="display-1">
          Display Heading
        </Heading>,
      );
      const element = screen.getByText('Display Heading');
      expect(element).toHaveAttribute('data-type', 'display-1');
    });

    it('reflects a theme-augmented visual type and keeps the level baseline', () => {
      const baseline = render(<Heading level={2}>Baseline</Heading>);
      const baselineClasses = screen
        .getByText('Baseline')
        .className.split(/\s+/)
        .filter(Boolean);
      baseline.unmount();

      render(
        <Heading level={2} type="hero">
          Custom visual role
        </Heading>,
      );
      const element = screen.getByText('Custom visual role');

      expect(element).toHaveAttribute('data-type', 'hero');
      for (const className of baselineClasses) {
        expect(element.className).toContain(className);
      }
    });

    it('reflects an explicit weight for theme-layer precedence', () => {
      render(
        <Heading level={2} type="hero" weight="bold">
          Bold custom visual role
        </Heading>,
      );
      const element = screen.getByText('Bold custom visual role');

      expect(element).toHaveAttribute('data-weight', 'bold');
      expect(element.tagName).toBe('H2');
    });
  });

  it('renders astryx-* classes and data attributes for theme targeting', () => {
    render(
      <Heading level={2} color="secondary">
        Themed Heading
      </Heading>,
    );
    const element = screen.getByText('Themed Heading');
    expect(element.className).toContain('astryx-heading');
    expect(element).toHaveAttribute('data-level', '2');
    expect(element).toHaveAttribute('data-color', 'secondary');
  });

  it('does not reflect an omitted visual type', () => {
    render(<Heading level={1}>No Variant</Heading>);
    const element = screen.getByText('No Variant');
    expect(element).not.toHaveAttribute('data-type', 'default');
    expect(element).not.toHaveAttribute('data-type', 'editorial');
  });
});

// With hasTruncateTooltip={false} nothing reads the measured overflow, so a
// long table of truncated cells must not pay a layout read per cell.
function countScrollWidthReads(run: () => void): number {
  const proto = window.HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
  let reads = 0;
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get() {
      reads += 1;
      return 0;
    },
  });
  try {
    run();
  } finally {
    if (original) {
      Object.defineProperty(proto, 'scrollWidth', original);
    } else {
      delete (proto as {scrollWidth?: number}).scrollWidth;
    }
  }
  return reads;
}

describe('Heading maxLines without a truncation tooltip', () => {
  it('takes no truncation measurement when hasTruncateTooltip is false', () => {
    const reads = countScrollWidthReads(() => {
      render(
        <>
          {Array.from({length: 20}, (_, index) => (
            <Heading
              level={3}
              maxLines={1}
              hasTruncateTooltip={false}
              key={index}>
              Cell {index} with text far wider than its column
            </Heading>
          ))}
        </>,
      );
    });
    expect(reads).toBe(0);
  });

  it('still measures when the tooltip is enabled', () => {
    const reads = countScrollWidthReads(() => {
      render(
        <Heading level={3} maxLines={1}>
          Text far wider than its column
        </Heading>,
      );
    });
    expect(reads).toBeGreaterThan(0);
  });
});
