// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SankeyLink.test.tsx
 * @input Renders SankeyLink inside SankeyChart with a stubbed ResizeObserver
 * @output Render-smoke coverage for link ribbons: bezier geometry, gradient
 *   defs and bias, source/target/flat color modes, tension (#4295)
 * @position Colocated test for SankeyLink.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {SankeyChart} from './SankeyChart';
import {SankeyLink} from './SankeyLink';
import type {SankeyNodeDatum, SankeyLinkDatum} from './types';

// Explicit oklch colors so assertions don't couple to the default palette.
// values of 8 with height=300 give an exact valueScale of 32
// (usableHeight = 300 - 28 - 16 = 256; 256 / 8 = 32), so every
// coordinate below is integer-exact.
const nodes: SankeyNodeDatum[] = [
  {id: 'a', label: 'A', value: 8, color: [0.5, 0.1, 100]},
  {id: 'b', label: 'B', value: 8, color: [0.6, 0.2, 200]},
  {id: 'c', label: 'C', value: 8, color: [0.7, 0.3, 300]},
];
const links: SankeyLinkDatum[] = [
  {source: 'a', target: 'b', value: 4},
  {source: 'b', target: 'c', value: 4},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  act(() => {
    resizeCallback?.(
      [{contentRect: {width}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

function renderLink(props?: React.ComponentProps<typeof SankeyLink>) {
  const result = render(
    <SankeyChart nodes={nodes} links={links} height={300}>
      <SankeyLink {...props} />
    </SankeyChart>,
  );
  reportWidth(1000);
  return result;
}

describe('SankeyLink', () => {
  it('renders one ribbon path per link with the bezier geometry from layout', () => {
    const {container} = renderLink();

    // Columns land at x = 0 / 490 / 980; nodes span y = 28..284; each
    // link is 128 tall; tension 0.5 puts control points midway (dx = 235).
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute(
      'd',
      'M20,28 C255,28 255,28 490,28 L490,156 C255,156 255,156 20,156 Z',
    );
    expect(paths[1]).toHaveAttribute(
      'd',
      'M510,28 C745,28 745,28 980,28 L980,156 C745,156 745,156 510,156 Z',
    );
  });

  it('defaults to per-link gradient defs spanning source to target', () => {
    const {container} = renderLink();

    const grads = container.querySelectorAll('linearGradient');
    expect(grads).toHaveLength(2);
    expect(grads[0]).toHaveAttribute('id', 'astryx-sankey-grad-0');
    expect(grads[0]).toHaveAttribute('gradientUnits', 'userSpaceOnUse');
    // Gradient runs from the source bar's right edge to the target bar.
    expect(grads[0]).toHaveAttribute('x1', '20');
    expect(grads[0]).toHaveAttribute('x2', '490');

    // Default bias 0.5 → inner stops at 35% / 65%, alpha 0.7 * 0.9 = 0.63.
    const stops = grads[0].querySelectorAll('stop');
    expect(stops).toHaveLength(4);
    expect(stops[0]).toHaveAttribute('offset', '0%');
    expect(stops[0]).toHaveAttribute('stop-color', 'oklch(0.5 0.1 100 / 0.7)');
    expect(stops[1]).toHaveAttribute('offset', '35%');
    expect(stops[1]).toHaveAttribute('stop-color', 'oklch(0.5 0.1 100 / 0.63)');
    expect(stops[2]).toHaveAttribute('offset', '65%');
    expect(stops[2]).toHaveAttribute('stop-color', 'oklch(0.6 0.2 200 / 0.63)');
    expect(stops[3]).toHaveAttribute('offset', '100%');
    expect(stops[3]).toHaveAttribute('stop-color', 'oklch(0.6 0.2 200 / 0.7)');

    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', 'url(#astryx-sankey-grad-0)');
    expect(paths[1]).toHaveAttribute('fill', 'url(#astryx-sankey-grad-1)');
  });

  it('leans the gradient stops toward the target for a biased gradient', () => {
    const {container} = renderLink({color: {gradient: 0.75}});

    const stops = container
      .querySelectorAll('linearGradient')[0]
      .querySelectorAll('stop');
    expect(stops[1]).toHaveAttribute('offset', '60%');
    expect(stops[2]).toHaveAttribute('offset', '90%');
  });

  it('fills each ribbon with its source node color in source mode', () => {
    const {container} = renderLink({color: 'source'});

    expect(container.querySelector('linearGradient')).toBeNull();
    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', 'oklch(0.5 0.1 100 / 0.7)');
    expect(paths[1]).toHaveAttribute('fill', 'oklch(0.6 0.2 200 / 0.7)');
    // Alpha is baked into the oklch fill — no separate opacity attribute.
    expect(paths[0]).not.toHaveAttribute('opacity');
  });

  it('fills each ribbon with its target node color in target mode', () => {
    const {container} = renderLink({color: 'target'});

    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', 'oklch(0.6 0.2 200 / 0.7)');
    expect(paths[1]).toHaveAttribute('fill', 'oklch(0.7 0.3 300 / 0.7)');
  });

  it('applies a flat CSS color via fill plus a path opacity attribute', () => {
    const {container} = renderLink({color: '#ff8800', opacity: 0.5});

    expect(container.querySelector('defs')).toBeNull();
    const paths = container.querySelectorAll('path');
    expect(paths[0]).toHaveAttribute('fill', '#ff8800');
    expect(paths[0]).toHaveAttribute('opacity', '0.5');
  });

  it('draws straight ribbons when tension is 0', () => {
    const {container} = renderLink({tension: 0});

    // dx = 0 → control points sit on the endpoints.
    expect(container.querySelectorAll('path')[0]).toHaveAttribute(
      'd',
      'M20,28 C20,28 490,28 490,28 L490,156 C490,156 20,156 20,156 Z',
    );
  });

  it('renders no ribbons before the container reports a width', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} height={300}>
        <SankeyLink />
      </SankeyChart>,
    );

    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});
