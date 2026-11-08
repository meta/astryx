// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AspectRatio.test.tsx
 * @input Uses vitest, @testing-library/react, AspectRatio component
 * @output Unit tests for AspectRatio component behavior
 * @position Testing; validates AspectRatio.tsx implementation
 *
 * SYNC: When AspectRatio.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {AspectRatio} from './AspectRatio';

/**
 * The ratio compiles to a class-level `aspect-ratio: var(--x-aspectRatio)`
 * declaration with the value carried by a CSS variable (so xstyle/@media
 * and unlayered consumer CSS overrides can win). `--x-aspectRatio` is the
 * debug-mode variable name emitted for the `aspectRatio` property.
 */
function ratioVar(el: HTMLElement): string {
  return el.style.getPropertyValue('--x-aspectRatio');
}

function ratioValue(ratio: number): string {
  return String(ratio);
}

describe('AspectRatio', () => {
  it('renders with correct aspect ratio', () => {
    render(
      <AspectRatio ratio={16 / 9} data-testid="aspect-ratio">
        <div>Content</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(element).toBeInTheDocument();
    expect(ratioVar(element)).toBe(ratioValue(16 / 9));
  });

  it('children fill the container', () => {
    render(
      <AspectRatio ratio={1} data-testid="aspect-ratio">
        <div data-testid="child">Content</div>
      </AspectRatio>,
    );
    const container = screen.getByTestId('aspect-ratio');
    const child = screen.getByTestId('child');
    expect(container).toContainElement(child);
    // Child is wrapped in an absolute positioned div
    const childWrapper = child.parentElement;
    expect(childWrapper).not.toBeNull();
  });

  it('renders with 16:9 ratio', () => {
    const ratio = 16 / 9;
    render(
      <AspectRatio ratio={ratio} data-testid="aspect-ratio">
        <div>16:9</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(ratioVar(element)).toBe(ratioValue(ratio));
  });

  it('renders with 4:3 ratio', () => {
    const ratio = 4 / 3;
    render(
      <AspectRatio ratio={ratio} data-testid="aspect-ratio">
        <div>4:3</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(ratioVar(element)).toBe(ratioValue(ratio));
  });

  it('renders with 1:1 square ratio', () => {
    render(
      <AspectRatio ratio={1} data-testid="aspect-ratio">
        <div>Square</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(ratioVar(element)).toBe(ratioValue(1));
  });

  it('renders with 21:9 ultrawide ratio', () => {
    const ratio = 21 / 9;
    render(
      <AspectRatio ratio={ratio} data-testid="aspect-ratio">
        <div>Ultrawide</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(ratioVar(element)).toBe(ratioValue(ratio));
  });

  it('renders an ellipse that respects the ratio (circle at 1:1)', () => {
    render(
      <AspectRatio ratio={1} shape="ellipse" data-testid="aspect-ratio">
        <div>Circle</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(ratioVar(element)).toBe(ratioValue(1));
    expect(element).toHaveAttribute('data-shape', 'ellipse');
  });

  it('ellipse respects a non-square ratio (oval)', () => {
    render(
      <AspectRatio ratio={16 / 9} shape="ellipse" data-testid="aspect-ratio">
        <div>Oval</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    // Ratio is preserved — the ellipse does not force 1:1.
    expect(ratioVar(element)).toBe(ratioValue(16 / 9));
    expect(element).toHaveAttribute('data-shape', 'ellipse');
  });

  it('defaults to the rectangle shape', () => {
    render(
      <AspectRatio ratio={1} data-testid="aspect-ratio">
        <div>Rectangle by default</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(ratioVar(element)).toBe(ratioValue(1));
    expect(element).toHaveAttribute('data-shape', 'rectangle');
    // No ellipse border-radius when shape is the default rectangle
    expect(element.style.borderRadius).toBe('');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <AspectRatio ratio={1} ref={ref}>
        <div>Content</div>
      </AspectRatio>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  it('passes through additional props', () => {
    render(
      <AspectRatio
        ratio={1}
        data-testid="aspect-ratio"
        aria-label="Image container">
        <div>Content</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(element).toHaveAttribute('aria-label', 'Image container');
  });

  it('renders with ReactNode children', () => {
    render(
      <AspectRatio ratio={16 / 9} data-testid="aspect-ratio">
        <img
          src="test.jpg"
          alt="Test"
          data-testid="image"
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      </AspectRatio>,
    );
    const image = screen.getByTestId('image');
    expect(image).toBeInTheDocument();
  });

  it('renders with xstyle prop', () => {
    // Verify that xstyle is accepted and component renders without error
    render(
      <AspectRatio ratio={1} data-testid="aspect-ratio" xstyle={{}}>
        <div>Content</div>
      </AspectRatio>,
    );
    const element = screen.getByTestId('aspect-ratio');
    expect(element).toBeInTheDocument();
  });

  it('renders different content types', () => {
    render(
      <AspectRatio ratio={16 / 9} data-testid="aspect-ratio">
        <video data-testid="video" src="test.mp4" />
      </AspectRatio>,
    );
    const video = screen.getByTestId('video');
    expect(video).toBeInTheDocument();
  });

  describe('responsive ratio', () => {
    it('emits the ratio as a class-level declaration, not an inline style', () => {
      render(
        <AspectRatio ratio={3 / 1} data-testid="aspect-ratio">
          <div>Hero</div>
        </AspectRatio>,
      );
      const element = screen.getByTestId('aspect-ratio');
      // No inline aspect-ratio — the declaration lives in a class reading a
      // CSS variable, so @media/@container rules (via xstyle, or via
      // unlayered consumer CSS beating the astryx-base layer) can override
      // it.
      expect(element.style.aspectRatio).toBe('');
      expect(ratioVar(element)).toBe(ratioValue(3 / 1));
    });

    it('lets a consumer inline style win over the class-level ratio', () => {
      render(
        <AspectRatio
          ratio={3 / 1}
          style={{aspectRatio: '3 / 2'}}
          data-testid="aspect-ratio">
          <div>Hero</div>
        </AspectRatio>,
      );
      const element = screen.getByTestId('aspect-ratio');
      // The consumer's style prop passes through untouched (it is no longer
      // merged with a component-owned inline aspect-ratio).
      expect(element.style.aspectRatio).toBe('3 / 2');
    });
  });

  describe('fit', () => {
    it('marks the child\'s direct parent with data-astryx-aspect-ratio-override for fit="cover"', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="cover">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      // Earlier releases documented the marker, so it stays on the child's
      // direct parent for product CSS that targets it.
      const wrapper = screen.getByTestId('image').parentElement;
      expect(wrapper).toHaveAttribute(
        'data-astryx-aspect-ratio-override',
        'cover',
      );
    });

    it('marks the child\'s direct parent with data-astryx-aspect-ratio-override for fit="contain"', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="contain">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      const wrapper = screen.getByTestId('image').parentElement;
      expect(wrapper).toHaveAttribute(
        'data-astryx-aspect-ratio-override',
        'contain',
      );
    });

    it('does not expose fit on the theming surface', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="cover" data-testid="aspect-ratio">
          <img src="test.jpg" alt="Test" />
        </AspectRatio>,
      );
      const element = screen.getByTestId('aspect-ratio');
      // fit is structural, not visual — no data-fit attribute or class
      // token on the themeable root (only shape is a theming target).
      expect(element).not.toHaveAttribute('data-fit');
      expect(element.className).not.toContain('cover');
    });

    it('emits no marker when fit is omitted (back-compat)', () => {
      render(
        <AspectRatio ratio={16 / 9} data-testid="aspect-ratio">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      const wrapper = screen.getByTestId('image').parentElement;
      expect(wrapper).not.toHaveAttribute('data-astryx-aspect-ratio-override');
      // Without fit the wrapper carries no child-sizing styles, so existing
      // self-styled children render exactly as before.
      expect(wrapper?.className).not.toContain('childFill');
      expect(wrapper?.className).not.toContain('childCover');
      expect(wrapper?.className).not.toContain('childContain');
      expect(screen.getByTestId('image')).not.toHaveAttribute('class');
    });

    it('never touches the child element props', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="cover">
          <img
            src="test.jpg"
            alt="Test"
            data-testid="image"
            className="consumer-class"
            style={{objectFit: 'contain'}}
          />
        </AspectRatio>,
      );
      const image = screen.getByTestId('image');
      // Fit styling is a direct-child rule on the wrapper; the child's own
      // className/style pass through untouched, and an inline style still
      // wins over it.
      expect(image.className).toBe('consumer-class');
      expect(image.style.objectFit).toBe('contain');
    });

    it('sizes the child from the wrapper with fit="cover"', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="cover">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      const wrapper = screen.getByTestId('image').parentElement;
      expect(wrapper?.className).toContain('childFill');
      expect(wrapper?.className).toContain('childCover');
      expect(wrapper?.className).not.toContain('childContain');
    });

    it('sizes the child from the wrapper with fit="contain"', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="contain">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      const wrapper = screen.getByTestId('image').parentElement;
      expect(wrapper?.className).toContain('childFill');
      expect(wrapper?.className).toContain('childContain');
      expect(wrapper?.className).not.toContain('childCover');
    });

    it('centers the child via the wrapper with fit="center"', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="center">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      const image = screen.getByTestId('image');
      expect(image).not.toHaveAttribute('class');
      const wrapper = image.parentElement;
      expect(wrapper?.className).toContain('childCenter');
      expect(wrapper?.className).not.toContain('childFill');
    });

    it('does not center the wrapper for other fit values', () => {
      render(
        <AspectRatio ratio={16 / 9} fit="cover">
          <img src="test.jpg" alt="Test" data-testid="image" />
        </AspectRatio>,
      );
      const wrapper = screen.getByTestId('image').parentElement;
      expect(wrapper?.className).not.toContain('childCenter');
    });
  });

  describe('style merging', () => {
    it('keeps the consumer style and lets an inline ratio win', () => {
      render(
        <AspectRatio
          ratio={16 / 9}
          data-testid="aspect-ratio"
          style={{opacity: 0.5, aspectRatio: '3 / 1'}}>
          <div>Content</div>
        </AspectRatio>,
      );
      const element = screen.getByTestId('aspect-ratio');
      expect(element.style.opacity).toBe('0.5');
      expect(element.style.aspectRatio).toBe('3 / 1');
      expect(ratioVar(element)).toBe(ratioValue(16 / 9));
    });

    it('keeps a consumer className beside the theme target', () => {
      render(
        <AspectRatio
          ratio={1}
          data-testid="aspect-ratio"
          className="consumer-class">
          <div>Content</div>
        </AspectRatio>,
      );
      const element = screen.getByTestId('aspect-ratio');
      expect(element).toHaveClass('consumer-class');
      expect(element).toHaveClass('astryx-aspect-ratio');
    });
  });

  describe('reset.css', () => {
    it('carries no AspectRatio rules', async () => {
      // fit ships with the component's StyleX styles in `astryx-base`. A
      // rule in reset.css sits below the layer the documented Tailwind
      // setups give preflight, whose `img, video { height: auto }` would
      // undo the fill.
      const fs = await import('fs');
      const path = await import('path');
      const resetCSS = fs.readFileSync(
        path.resolve(__dirname, '../reset.css'),
        'utf-8',
      );
      expect(resetCSS).not.toContain('aspect-ratio-override');
    });
  });
});
