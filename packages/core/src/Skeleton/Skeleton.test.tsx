// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Skeleton} from './Skeleton';
import type {SkeletonRadius} from './Skeleton';
import {declaredValue} from '../__tests__/stylexDeclarations';
import {
  getAllInjectedCss,
  getForcedColorsRules,
} from '../__tests__/forcedColors';

/** The declarations the element's atomic classes carry, as `prop: value`. */
function declarationsOf(el: Element, css: string): string[] {
  const out: string[] = [];
  for (const cls of Array.from(el.classList)) {
    const re = new RegExp(`\\.${cls}\\b[^{]*\\{([^}]*)\\}`, 'g');
    for (const match of css.matchAll(re)) {
      out.push(
        ...match[1]
          .split(';')
          .map(d => d.trim())
          .filter(Boolean),
      );
    }
  }
  return out;
}

/** The whole `@keyframes <name> { … }` rule, braces matched. */
function keyframesRule(css: string, name: string): string {
  const start = css.search(new RegExp(`@keyframes ${name}\\b`, 'i'));
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') {
      depth += 1;
    }
    if (css[i] === '}' && --depth === 0) {
      return css.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated @keyframes ${name}`);
}

/** The named animation's opacity keyframes as [offset 0..1, opacity], in order. */
function opacityKeyframes(css: string, name: string): [number, number][] {
  return Array.from(
    keyframesRule(css, name).matchAll(/([\d.]+)%\s*\{\s*opacity:\s*([\d.]+)/g),
    m => [Number(m[1]) / 100, Number(m[2])] as [number, number],
  );
}

/** Opacity at iteration progress x, linear between keyframes. */
function opacityAt(frames: [number, number][], x: number): number {
  for (let i = 1; i < frames.length; i += 1) {
    const [x0, y0] = frames[i - 1];
    const [x1, y1] = frames[i];
    if (x <= x1) {
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return frames[frames.length - 1][1];
}

/** The value a dynamic StyleX property resolves to on this element. */
function resolved(el: HTMLElement, property: string): string {
  const declared = declaredValue(el, property) ?? '';
  const name = /^var\((--[\w-]+)/.exec(declared)?.[1];
  return name ? el.style.getPropertyValue(name) : declared;
}

describe('Skeleton', () => {
  it('renders a placeholder element', () => {
    render(<Skeleton width={200} height={20} data-testid="sk" />);
    expect(screen.getByTestId('sk')).toBeInTheDocument();
  });

  it('is hidden from assistive tech by default (complex-20)', () => {
    render(<Skeleton width={200} height={20} data-testid="sk" />);
    expect(screen.getByTestId('sk')).toHaveAttribute('aria-hidden', 'true');
  });

  it('allows the aria-hidden default to be overridden', () => {
    render(
      <Skeleton width={200} height={20} data-testid="sk" aria-hidden={false} />,
    );
    // Consumer opt-out: not hidden when explicitly set false.
    expect(screen.getByTestId('sk')).toHaveAttribute('aria-hidden', 'false');
  });
});

describe('pulse', () => {
  function pulse() {
    render(<Skeleton width={200} height={20} data-testid="sk" />);
    const css = getAllInjectedCss();
    const declarations = declarationsOf(screen.getByTestId('sk'), css);
    const value = (prop: string) =>
      declarations
        .filter(d => d.startsWith(`${prop}:`))
        .map(d => d.slice(prop.length + 1).trim());
    return {css, value};
  }

  // WebKit runs no animation with a steps() timing function on the
  // compositor, so a stepped pulse would freeze in Safari while a script runs.
  it('keeps steps() out of the timing function so every engine can composite it', () => {
    const {css, value} = pulse();
    expect(value('animation-timing-function')).toEqual(['linear']);
    expect(value('animation-direction')).toEqual(['alternate']);
    expect(value('animation-iteration-count')).toEqual(['infinite']);
    const name = value('animation-name').find(v => v !== 'none');
    expect(name).toBeTruthy();
    const rule = keyframesRule(css, name ?? '');
    expect(rule).toMatch(/opacity/);
    expect(rule).not.toMatch(/steps\(|animation-timing-function/);
  });

  it('climbs and falls through the same ten opacity steps at the same times', () => {
    const {css, value} = pulse();
    const name = value('animation-name').find(v => v !== 'none') ?? '';
    const frames = opacityKeyframes(css, name);
    expect(frames[0]).toEqual([0, 0.25]);
    // The previous pulse: 0.25 → 1 through steps(10, end), played back down
    // by `alternate`. Sample each tenth away from its edges.
    for (let step = 0; step < 10; step += 1) {
      for (const within of [0.02, 0.5, 0.98]) {
        const x = (step + within) / 10;
        const expected = 0.25 + 0.75 * (step / 10);
        expect(opacityAt(frames, x)).toBeCloseTo(expected, 6);
      }
    }
    // Each change between steps takes 0.01% of an iteration.
    for (let i = 1; i < frames.length; i += 1) {
      const [x0, y0] = frames[i - 1];
      const [x1, y1] = frames[i];
      if (y1 !== y0) {
        expect(x1 - x0).toBeCloseTo(0.0001, 6);
      }
    }
  });
});

// jsdom cannot emulate forced-colors rendering, so these assert that the
// compiled output includes the forced-colors rules; visual behavior needs
// manual verification under Windows High Contrast.
describe('forced colors (WCAG 1.4.11)', () => {
  it('compiles forced-colors overrides so the placeholder stays visible under Windows High Contrast', () => {
    render(<Skeleton width={200} height={20} data-testid="sk" />);
    const css = getForcedColorsRules();
    // The painted fill is stripped to Canvas (invisible); GrayText is a
    // system color, so it survives forcing.
    expect(css).toContain('background-color: graytext;');
    // The resting 0.25 opacity is lifted so the static placeholder reads.
    expect(css).toContain('opacity: 1;');
  });
});

describe('size', () => {
  it('fills its container when no size is given', () => {
    render(<Skeleton data-testid="sk" />);
    const el = screen.getByTestId('sk');
    expect(resolved(el, 'width')).toBe('100%');
    expect(resolved(el, 'height')).toBe('100%');
  });

  it('reads a number as pixels', () => {
    render(<Skeleton width={200} height={20} data-testid="sk" />);
    const el = screen.getByTestId('sk');
    expect(resolved(el, 'width')).toBe('200px');
    expect(resolved(el, 'height')).toBe('20px');
  });

  it('passes a string size through unchanged', () => {
    render(<Skeleton width="12rem" height="50%" data-testid="sk" />);
    const el = screen.getByTestId('sk');
    expect(resolved(el, 'width')).toBe('12rem');
    expect(resolved(el, 'height')).toBe('50%');
  });
});

describe('stagger', () => {
  it('starts the pulse after a one second delay by default', () => {
    render(<Skeleton width={200} height={20} data-testid="sk" />);
    expect(resolved(screen.getByTestId('sk'), 'animation-delay')).toBe(
      '1000ms',
    );
  });

  it('adds 100ms to the delay for each index step', () => {
    const {rerender} = render(
      <Skeleton width={200} height={20} index={1} data-testid="sk" />,
    );
    expect(resolved(screen.getByTestId('sk'), 'animation-delay')).toBe(
      '1100ms',
    );
    rerender(<Skeleton width={200} height={20} index={3} data-testid="sk" />);
    expect(resolved(screen.getByTestId('sk'), 'animation-delay')).toBe(
      '1300ms',
    );
  });
});

describe('radius', () => {
  it.each([
    ['none', '0'],
    [0, 'var(--radius-none)'],
    [1, 'var(--radius-inner)'],
    [2, 'var(--radius-element)'],
    [3, 'var(--radius-container)'],
    [4, 'var(--radius-container)'],
    ['rounded', 'var(--radius-full)'],
  ] as [SkeletonRadius, string][])('maps radius %s to %s', (radius, token) => {
    render(<Skeleton radius={radius} data-testid="sk" />);
    expect(declaredValue(screen.getByTestId('sk'), 'border-radius')).toBe(
      token,
    );
  });
});

describe('props', () => {
  it('forwards its ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Skeleton ref={ref} width={200} height={20} data-testid="sk" />);
    expect(ref.current).toBe(screen.getByTestId('sk'));
  });

  it('keeps a caller className and style next to its own', () => {
    render(
      <Skeleton
        width={200}
        height={20}
        className="caller-class"
        style={{marginTop: 4}}
        data-testid="sk"
      />,
    );
    const el = screen.getByTestId('sk');
    expect(el).toHaveClass('caller-class');
    expect(el.style.marginTop).toBe('4px');
    expect(resolved(el, 'width')).toBe('200px');
  });

  it('passes other attributes through to the root element', () => {
    render(
      <Skeleton width={200} height={20} data-testid="sk" data-extra="yes" />,
    );
    expect(screen.getByTestId('sk')).toHaveAttribute('data-extra', 'yes');
  });
});
