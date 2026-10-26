// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Badge} from './Badge';
import {getForcedColorsRules} from '../__tests__/forcedColors';

describe('Badge', () => {
  it('renders with default variant', () => {
    render(<Badge label="Default" />);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('renders with semantic variants', () => {
    const {rerender} = render(<Badge variant="success" label="Success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();

    rerender(<Badge variant="error" label="Error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();

    rerender(<Badge variant="warning" label="Warning" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();

    rerender(<Badge variant="info" label="Info" />);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('renders with non-semantic color variants', () => {
    const colors = [
      'blue',
      'cyan',
      'green',
      'orange',
      'pink',
      'purple',
      'red',
      'teal',
      'yellow',
    ] as const;

    const {rerender} = render(<Badge variant={colors[0]} label={colors[0]} />);
    expect(screen.getByText(colors[0])).toBeInTheDocument();

    for (const color of colors.slice(1)) {
      rerender(<Badge variant={color} label={color} />);
      expect(screen.getByText(color)).toBeInTheDocument();
    }
  });

  it('applies astryx class name with non-semantic variant', () => {
    const {container} = render(<Badge variant="purple" label="Tag" />);
    const root = container.firstElementChild!;
    expect(root.className).toContain('astryx-badge');
    expect(root).toHaveAttribute('data-variant', 'purple');
  });

  it('renders with icon', () => {
    render(
      <Badge icon={<span data-testid="icon">*</span>} label="With Icon" />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.getByText('With Icon')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLSpanElement | null};
    render(<Badge ref={ref} label="Test" />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('spreads additional props', () => {
    render(<Badge data-testid="custom-badge" label="Test" />);
    expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
  });

  describe('full-label fallback', () => {
    it('carries the full text in title for a string label', () => {
      // The label is clipped when it does not fit, so the full text has to be
      // reachable. No measurement is involved, so this holds on the server too.
      const {container} = render(<Badge label="Awaiting security review" />);
      expect(container.firstElementChild).toHaveAttribute(
        'title',
        'Awaiting security review',
      );
    });

    it('carries a number label too', () => {
      const {container} = render(<Badge label={42} />);
      expect(container.firstElementChild).toHaveAttribute('title', '42');
    });

    it('sets no title for a rich label', () => {
      // Flattening a subtree to a string renders a guess — an icon or nested
      // element reads differently — so it is left alone rather than guessed at.
      const {container} = render(<Badge label={<strong>Rich</strong>} />);
      expect(container.firstElementChild).not.toHaveAttribute('title');
    });

    it('sets no title for an empty string label', () => {
      // Nothing to recover, so nothing to announce — the same guard
      // `BaseTable` applies to a truncated header cell.
      const {container} = render(<Badge label="" />);
      expect(container.firstElementChild).not.toHaveAttribute('title');
    });
  });

  it('renders astryx-* class names for theme targeting', () => {
    const {container} = render(<Badge variant="success" label="Active" />);
    const root = container.firstElementChild!;
    expect(root.className).toContain('astryx-badge');
    expect(root).toHaveAttribute('data-variant', 'success');
  });
});

// jsdom cannot emulate forced colors, so this asserts the compiled rule the
// status fill relies on (architecture:theme-tokens INV11): the fill becomes
// Canvas, and a CanvasText boundary keeps its shape.
describe('Badge forced colors', () => {
  it('keeps a visible boundary on the status fill', () => {
    render(<Badge variant="error" label="Failed" />);
    const css = getForcedColorsRules();
    expect(css).toContain('outline-style: solid;');
    expect(css).toContain('outline-color: canvastext;');
  });
});
