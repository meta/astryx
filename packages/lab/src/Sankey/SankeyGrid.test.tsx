// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SankeyGrid.test.tsx
 * @input Renders SankeyGrid inside SankeyChart with a stubbed ResizeObserver
 * @output Render-smoke coverage for grid lines: per-column dashed lines,
 *   column headers from rich defs, header toggle, stroke overrides (#4295)
 * @position Colocated test for SankeyGrid.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {SankeyChart} from './SankeyChart';
import {SankeyGrid} from './SankeyGrid';
import type {SankeyColumn, SankeyNodeDatum, SankeyLinkDatum} from './types';

const nodes: SankeyNodeDatum[] = [
  {id: 'a', label: 'A', value: 8},
  {id: 'b', label: 'B', value: 8},
  {id: 'c', label: 'C', value: 8},
];
const links: SankeyLinkDatum[] = [
  {source: 'a', target: 'b', value: 4},
  {source: 'b', target: 'c', value: 4},
];
const richColumns: SankeyColumn[] = [
  {ids: ['a'], label: 'Source'},
  {ids: ['b'], label: 'Middle'},
  {ids: ['c'], label: 'Target'},
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

describe('SankeyGrid', () => {
  it('renders one dashed full-height line per column at the bar center', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} columns={richColumns}>
        <SankeyGrid />
      </SankeyChart>,
    );
    reportWidth(1000);

    // Columns at x = 0 / 490 / 980, bar center = x + nodeWidth/2.
    const lines = container.querySelectorAll('line');
    expect(lines).toHaveLength(3);
    const centers = ['10', '500', '990'];
    lines.forEach((line, i) => {
      expect(line).toHaveAttribute('x1', centers[i]);
      expect(line).toHaveAttribute('x2', centers[i]);
      expect(line).toHaveAttribute('y1', '0');
      expect(line).toHaveAttribute('y2', '320');
      expect(line).toHaveAttribute('stroke', 'var(--color-border, #d0d0d8)');
      expect(line).toHaveAttribute('stroke-opacity', '0.3');
      expect(line).toHaveAttribute('stroke-dasharray', '4 4');
      expect(line).toHaveAttribute('stroke-width', '1');
    });
  });

  it('renders header labels from rich column defs at the chart bottom', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} columns={richColumns}>
        <SankeyGrid />
      </SankeyChart>,
    );
    reportWidth(1000);

    const texts = Array.from(container.querySelectorAll('text'));
    expect(texts.map(t => t.textContent)).toEqual([
      'Source',
      'Middle',
      'Target',
    ]);
    expect(texts[0]).toHaveAttribute('x', '10');
    expect(texts[1]).toHaveAttribute('x', '500');
    expect(texts[2]).toHaveAttribute('x', '990');
    expect(texts[0]).toHaveAttribute('y', '318');
    expect(texts[0]).toHaveAttribute('text-anchor', 'middle');
  });

  it('suppresses headers but keeps the lines when showHeaders is off', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} columns={richColumns}>
        <SankeyGrid showHeaders={false} />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(container.querySelectorAll('text')).toHaveLength(0);
    expect(container.querySelectorAll('line')).toHaveLength(3);
  });

  it('renders no headers for simple string[] columns', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} columns={[['a'], ['b'], ['c']]}>
        <SankeyGrid />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(container.querySelectorAll('text')).toHaveLength(0);
    expect(container.querySelectorAll('line')).toHaveLength(3);
  });

  it('applies custom color, dash pattern, and opacity to the lines', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} columns={richColumns}>
        <SankeyGrid color="#123456" dashArray="2 6" opacity={0.5} />
      </SankeyChart>,
    );
    reportWidth(1000);

    const line = container.querySelector('line');
    expect(line).toHaveAttribute('stroke', '#123456');
    expect(line).toHaveAttribute('stroke-dasharray', '2 6');
    expect(line).toHaveAttribute('stroke-opacity', '0.5');
  });

  it('renders no lines before the container reports a width', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} columns={richColumns}>
        <SankeyGrid />
      </SankeyChart>,
    );

    expect(container.querySelectorAll('line')).toHaveLength(0);
  });
});
