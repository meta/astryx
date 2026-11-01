// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text.test.tsx
 * Tests for Text component
 */

import {render, screen} from '@testing-library/react';
import {describe, it, expect, vi} from 'vitest';
import {Text} from './Text';
import type {TextType} from './Text';
import type {TextColor} from '../theme/types';

describe('Text', () => {
  describe('rendering', () => {
    it('renders without type prop (defaults to body)', () => {
      render(<Text>Default body text</Text>);
      expect(screen.getByText('Default body text')).toBeInTheDocument();
    });

    it('renders children correctly', () => {
      render(<Text type="body">Hello World</Text>);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('keeps a forwarded ref attached across rerenders', () => {
      const ref = vi.fn();
      const {rerender} = render(
        <Text ref={ref} type="body">
          Before
        </Text>,
      );

      const element = screen.getByText('Before');
      expect(ref).toHaveBeenLastCalledWith(element);
      ref.mockClear();

      rerender(
        <Text ref={ref} type="body">
          After
        </Text>,
      );

      expect(ref).not.toHaveBeenCalled();
      expect(screen.getByText('After')).toBe(element);
    });

    it('renders as span by default', () => {
      render(<Text type="body">Text</Text>);
      const element = screen.getByText('Text');
      expect(element.tagName).toBe('SPAN');
    });

    it('renders as paragraph when as="p"', () => {
      render(
        <Text type="body" as="p">
          Paragraph
        </Text>,
      );
      const element = screen.getByText('Paragraph');
      expect(element.tagName).toBe('P');
    });

    it('renders as div when as="div"', () => {
      render(
        <Text type="body" as="div">
          Div
        </Text>,
      );
      const element = screen.getByText('Div');
      expect(element.tagName).toBe('DIV');
    });

    it('renders as label when as="label"', () => {
      render(
        <Text type="body" as="label">
          Label
        </Text>,
      );
      const element = screen.getByText('Label');
      expect(element.tagName).toBe('LABEL');
    });
  });

  describe('types', () => {
    it('renders body type', () => {
      render(<Text type="body">Body text</Text>);
      expect(screen.getByText('Body text')).toBeInTheDocument();
    });

    it('renders large type', () => {
      render(<Text type="large">Large text</Text>);
      expect(screen.getByText('Large text')).toBeInTheDocument();
    });

    it('renders supporting type', () => {
      render(<Text type="supporting">Supporting text</Text>);
      expect(screen.getByText('Supporting text')).toBeInTheDocument();
    });

    it('renders code type', () => {
      render(<Text type="code">const x = 1;</Text>);
      expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    });

    it('renders label type', () => {
      render(<Text type="label">Label text</Text>);
      expect(screen.getByText('Label text')).toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('forwards additional props', () => {
      render(
        <Text type="body" data-testid="custom-text">
          Text
        </Text>,
      );
      expect(screen.getByTestId('custom-text')).toBeInTheDocument();
    });

    it('accepts color prop', () => {
      render(
        <Text type="body" color="secondary">
          Secondary text
        </Text>,
      );
      expect(screen.getByText('Secondary text')).toBeInTheDocument();
    });

    it('accepts weight prop', () => {
      render(
        <Text type="body" weight="bold">
          Bold text
        </Text>,
      );
      expect(screen.getByText('Bold text')).toBeInTheDocument();
    });

    it('reflects explicit size overrides for styling and theming', () => {
      render(
        <Text type="code" size="2xs">
          Tiny code
        </Text>,
      );
      const element = screen.getByText('Tiny code');
      expect(element).toHaveAttribute('data-size', '2xs');
    });

    it('accepts display prop', () => {
      render(
        <Text type="body" display="block">
          Block text
        </Text>,
      );
      expect(screen.getByText('Block text')).toBeInTheDocument();
    });

    it('accepts hasStrikethrough prop', () => {
      render(
        <Text type="body" hasStrikethrough>
          Strikethrough text
        </Text>,
      );
      expect(screen.getByText('Strikethrough text')).toBeInTheDocument();
    });

    it('accepts hasTabularNumbers prop', () => {
      render(
        <Text type="body" hasTabularNumbers>
          12345
        </Text>,
      );
      expect(screen.getByText('12345')).toBeInTheDocument();
    });

    it('accepts hasCapsize prop', () => {
      render(
        <Text type="body" hasCapsize>
          Capsize text
        </Text>,
      );
      expect(screen.getByText('Capsize text')).toBeInTheDocument();
    });

    it('accepts textWrap prop', () => {
      render(
        <Text type="body" textWrap="balance">
          Balanced text wrap
        </Text>,
      );
      expect(screen.getByText('Balanced text wrap')).toBeInTheDocument();
    });

    it('accepts maxLines prop', () => {
      render(
        <Text type="body" maxLines={2}>
          This is a long text that should be truncated to two lines
        </Text>,
      );
      expect(
        screen.getByText(
          'This is a long text that should be truncated to two lines',
        ),
      ).toBeInTheDocument();
    });

    it('accepts wordBreak prop', () => {
      render(
        <Text type="body" maxLines={1} wordBreak="break-word">
          Text with word break
        </Text>,
      );
      expect(screen.getByText('Text with word break')).toBeInTheDocument();
    });

    it('accepts hasTruncateTooltip=false to disable tooltip', () => {
      render(
        <Text type="body" maxLines={1} hasTruncateTooltip={false}>
          No tooltip
        </Text>,
      );
      expect(screen.getByText('No tooltip')).toBeInTheDocument();
    });
  });

  it('renders the stable target and type data attribute for theme targeting', () => {
    render(<Text type="body">Themed Text</Text>);
    const element = screen.getByText('Themed Text');
    expect(element.className).toContain('astryx-text');
    expect(element).toHaveAttribute('data-type', 'body');
  });
});

describe('Text custom types', () => {
  it('renders custom text types with body fallback styles', () => {
    render(<Text type={'hero' as TextType}>Custom</Text>);
    const el = screen.getByText('Custom');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('astryx-text');
    expect(el).toHaveAttribute('data-type', 'hero');
  });

  it('applies primary color to custom types by default', () => {
    render(<Text type={'caption' as TextType}>Caption</Text>);
    expect(screen.getByText('Caption')).toHaveAttribute(
      'data-color',
      'primary',
    );
  });

  it('allows color override on custom types', () => {
    render(
      <Text type={'hero' as TextType} color="secondary">
        Muted
      </Text>,
    );
    expect(screen.getByText('Muted')).toHaveAttribute(
      'data-color',
      'secondary',
    );
  });
});

describe('Text custom colors', () => {
  it('reflects a custom color for theme CSS to target', () => {
    // A theme adds a custom color through TextColorMap augmentation and
    // defineTheme. The rendered element keeps the stable Text target and
    // reflects the custom value as data-color so the generated theme selector
    // can reach it without a collision-prone bare class.
    render(<Text color={'brand' as TextColor}>Branded</Text>);
    const el = screen.getByText('Branded');
    expect(el.className).toContain('astryx-text');
    expect(el).toHaveAttribute('data-color', 'brand');
  });

  it('does not crash on a custom color (falls back to the primary StyleX baseline)', () => {
    // colorStyles has no entry for a custom color; the component must resolve a
    // built-in baseline instead of indexing undefined. Built-in `primary` is
    // the baseline, so both share its StyleX color class.
    render(
      <>
        <Text color={'brand' as TextColor}>Custom</Text>
        <Text color="primary">Builtin</Text>
      </>,
    );
    const custom = screen.getByText('Custom');
    const builtin = screen.getByText('Builtin');
    // Neither throws, and the custom color reuses primary's baseline StyleX
    // class (the real color comes from theme CSS via `data-color="brand"`).
    const primaryAtomic = builtin.className
      .split(/\s+/)
      .filter(c => c.startsWith('x'));
    expect(primaryAtomic.length).toBeGreaterThan(0);
    for (const cls of primaryAtomic) {
      expect(custom.className).toContain(cls);
    }
  });

  it('still applies built-in colors directly', () => {
    render(<Text color="accent">Accent</Text>);
    expect(screen.getByText('Accent')).toHaveAttribute('data-color', 'accent');
  });
});

// A truncated Text rendered its own Tooltip AND set `title` with the same
// string, so the browser drew a second, unstyled tooltip on top of ours.
describe('truncated text shows one tooltip, not two', () => {
  function withOverflow() {
    const proto = window.HTMLElement.prototype;
    const original = {
      scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
      offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
    };
    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(proto, 'offsetWidth', {
      configurable: true,
      get: () => 100,
    });
    return () => {
      if (original.scrollWidth) {
        Object.defineProperty(proto, 'scrollWidth', original.scrollWidth);
      }
      if (original.offsetWidth) {
        Object.defineProperty(proto, 'offsetWidth', original.offsetWidth);
      }
    };
  }

  it('leaves the native title to the tooltip it already renders', () => {
    const restore = withOverflow();
    try {
      render(
        <Text type="body" maxLines={1}>
          A label far wider than the space it has been given
        </Text>,
      );
      expect(
        screen.getByText('A label far wider than the space it has been given'),
      ).not.toHaveAttribute('title');
    } finally {
      restore();
    }
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

describe('Text maxLines without a truncation tooltip', () => {
  it('takes no truncation measurement when hasTruncateTooltip is false', () => {
    const reads = countScrollWidthReads(() => {
      render(
        <>
          {Array.from({length: 20}, (_, index) => (
            <Text
              type="body"
              maxLines={1}
              hasTruncateTooltip={false}
              key={index}>
              Cell {index} with text far wider than its column
            </Text>
          ))}
        </>,
      );
    });
    expect(reads).toBe(0);
  });

  it('still measures when the tooltip is enabled', () => {
    const reads = countScrollWidthReads(() => {
      render(
        <Text type="body" maxLines={1}>
          Text far wider than its column
        </Text>,
      );
    });
    expect(reads).toBeGreaterThan(0);
  });
});
