// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/marks.test.tsx
 * @input Uses vitest, @testing-library/react, Chart, all mark factories
 * @output Functional tests for the mark renderers — SVG shape output per mark
 *         type, missing-value gap handling, and GL marks degrading safely when
 *         WebGL is unavailable (jsdom has no canvas contexts)
 * @position Colocated test for the marks/ directory (issue #4295 viz coverage)
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, act, screen} from '@testing-library/react';
import {Chart} from '../Chart';
import {bar} from './bar';
import {line} from './line';
import {dot} from './dot';
import {area} from './area';
import {band} from './band';
import {candlestick} from './candlestick';
import {errorBar} from './errorBar';
import {referenceLine} from './referenceLine';
import {dotGL} from './dotGL';
import {dotGLInteractive} from './dotGLInteractive';
import {heatmapGL} from './heatmapGL';
import {streamGL, type StreamGLHandle} from './streamGL';
import type {SeriesDef} from '../types';

const DATA = [
  {m: 'A', v: 4},
  {m: 'B', v: 7},
  {m: 'C', v: 2},
];

// One missing value in the middle — marks must gap, not draw at the baseline.
const GAPPY = [
  {m: 'A', v: 4},
  {m: 'B', v: null},
  {m: 'C', v: 2},
];

const BOUNDS = [
  {m: 'A', hi: 5, lo: 1},
  {m: 'B', hi: 8, lo: 4},
  {m: 'C', hi: 6, lo: 2},
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

/** Render a chart, report a width, and return the clipped plot group. */
function renderMarks(
  series: SeriesDef[],
  data: Record<string, unknown>[] = DATA,
  xKey = 'm',
  extraProps: Partial<React.ComponentProps<typeof Chart>> = {},
) {
  const utils = render(
    <Chart data={data} xKey={xKey} series={series} {...extraProps} />,
  );
  reportWidth(600);
  const plot = utils.container.querySelector('g[clip-path]')!;
  return {...utils, plot};
}

describe('bar', () => {
  it('renders one top-rounded path per datum in the configured color', () => {
    const {plot} = renderMarks([bar('v', {color: '#123456'})]);
    const paths = plot.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(p).toHaveAttribute('fill', '#123456');
      expect(p.getAttribute('d')).toMatch(/^M/);
      // Positive bars round the top corners (default radius 4).
      expect(p.getAttribute('d')).toContain('Q');
    }
  });

  it('skips bars whose value is missing instead of drawing them at the baseline', () => {
    const {plot} = renderMarks([bar('v')], GAPPY);
    expect(plot.querySelectorAll('path')).toHaveLength(2);
  });

  it('stacked bars round only the topmost layer', () => {
    const stacked = [
      {m: 'A', a: 2, b: 3},
      {m: 'B', a: 4, b: 1},
    ];
    const {plot} = renderMarks(
      [bar('a', {stack: 'total'}), bar('b', {stack: 'total'})],
      stacked,
    );
    const groups = Array.from(plot.children).filter(el => el.tagName === 'g');
    const [lowerPaths, upperPaths] = groups.map(g =>
      Array.from(g.querySelectorAll('path')),
    );
    expect(lowerPaths).toHaveLength(2);
    expect(upperPaths).toHaveLength(2);
    // The lower layer is drawn square; only the stack top gets rounded corners.
    for (const p of lowerPaths) {
      expect(p.getAttribute('d')).not.toContain('Q');
    }
    for (const p of upperPaths) {
      expect(p.getAttribute('d')).toContain('Q');
    }
  });

  it('grouped bars render side by side within the band', () => {
    const grouped = [
      {m: 'A', a: 2, b: 3},
      {m: 'B', a: 4, b: 1},
    ];
    const {plot} = renderMarks(
      [bar('a', {group: 'g'}), bar('b', {group: 'g'})],
      grouped,
    );
    const groups = Array.from(plot.children).filter(el => el.tagName === 'g');
    const firstX = (g: Element) =>
      Number(
        g
          .querySelector('path')!
          .getAttribute('d')!
          .match(/^M([\d.]+)/)![1],
      );
    // For the same category, the second group's sub-bar starts further right.
    expect(firstX(groups[1])).toBeGreaterThan(firstX(groups[0]));
  });
});

describe('line', () => {
  it('renders a single stroke path with the configured color and width', () => {
    const {plot} = renderMarks([line('v', {color: '#ff0000', strokeWidth: 3})]);
    const paths = plot.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute('stroke', '#ff0000');
    expect(paths[0]).toHaveAttribute('stroke-width', '3');
    expect(paths[0]).toHaveAttribute('fill', 'none');
    expect(paths[0].getAttribute('d')).toMatch(/^M/);
  });

  it('draws per-point dots only where the value is finite', () => {
    const {plot} = renderMarks([line('v', {dots: true})], GAPPY);
    expect(plot.querySelectorAll('circle')).toHaveLength(2);
  });
});

describe('dot', () => {
  it('renders one circle per datum with the configured radius', () => {
    const {plot} = renderMarks([dot('v', {radius: 5})]);
    const circles = plot.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    for (const c of circles) {
      expect(c).toHaveAttribute('r', '5');
      expect(c).toHaveAttribute('opacity', '0.8'); // default
    }
  });

  it('skips points whose value is missing', () => {
    const {plot} = renderMarks([dot('v')], GAPPY);
    expect(plot.querySelectorAll('circle')).toHaveLength(2);
  });

  it('dodge spreads coincident points horizontally, centered on the shared x', () => {
    // Two rows in the same category land on the same band center.
    const coincident = [
      {m: 'A', v: 4},
      {m: 'A', v: 6},
      {m: 'B', v: 2},
    ];
    const {plot} = renderMarks(
      [dot('v', {dodge: true, radius: 4})],
      coincident,
    );
    const circles = Array.from(plot.querySelectorAll('circle'));
    expect(circles).toHaveLength(3);
    const [a1, a2] = circles.slice(0, 2).map(c => Number(c.getAttribute('cx')));
    // Spacing is radius * 2 + 1 = 9px, split symmetrically around the center.
    expect(a2 - a1).toBeCloseTo(9);
    const bandCenter = (a1 + a2) / 2;
    expect(Number(circles[0].getAttribute('cx'))).toBeCloseTo(bandCenter - 4.5);
  });
});

describe('area', () => {
  it('renders a translucent fill path plus a stroke path by default', () => {
    const {plot} = renderMarks([area('v', {color: '#00aa00'})]);
    const paths = plot.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute('fill', '#00aa00');
    expect(paths[0]).toHaveAttribute('fill-opacity', '0.3');
    expect(paths[1]).toHaveAttribute('fill', 'none');
    expect(paths[1]).toHaveAttribute('stroke', '#00aa00');
  });

  it('omits the stroke path when stroke is disabled', () => {
    const {plot} = renderMarks([area('v', {stroke: false})]);
    expect(plot.querySelectorAll('path')).toHaveLength(1);
  });

  it('gradient mode defines a per-series gradient and fills with it', () => {
    const {plot} = renderMarks([area('v', {gradient: true})]);
    const gradient = plot.querySelector('linearGradient')!;
    expect(gradient).not.toBeNull();
    expect(gradient.querySelectorAll('stop')).toHaveLength(2);
    const fillPath = plot.querySelector('path')!;
    expect(fillPath.getAttribute('fill')).toBe(`url(#${gradient.id})`);
  });
});

describe('band', () => {
  it('fills the region between the upper and lower bounds', () => {
    const {plot} = renderMarks([band({upper: 'hi', lower: 'lo'})], BOUNDS);
    const paths = plot.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute('fill-opacity', '0.15'); // default
    expect(paths[0].getAttribute('d')).toMatch(/^M/);
  });

  it('renders nothing when no point has both bounds', () => {
    const missing = [
      {m: 'A', lo: 1},
      {m: 'B', lo: 4},
    ];
    const {plot} = renderMarks([band({upper: 'hi', lower: 'lo'})], missing);
    expect(plot.querySelectorAll('path')).toHaveLength(0);
  });
});

describe('candlestick', () => {
  const OHLC = [
    {m: 'A', o: 2, h: 6, l: 1, c: 5}, // up: close >= open
    {m: 'B', o: 6, h: 7, l: 2, c: 3}, // down
    {m: 'C', o: 3, h: 5, l: 2, c: 4}, // up
  ];
  const series = () =>
    candlestick({open: 'o', high: 'h', low: 'l', close: 'c'});

  it('renders a wick line and a body rect per candle, colored by direction', () => {
    const {plot} = renderMarks([series()], OHLC);
    const rects = plot.querySelectorAll('rect');
    const wicks = plot.querySelectorAll('line');
    expect(rects).toHaveLength(3);
    expect(wicks).toHaveLength(3);
    expect(rects[0]).toHaveAttribute('fill', 'var(--color-success)');
    expect(rects[1]).toHaveAttribute('fill', 'var(--color-error)');
    expect(rects[2]).toHaveAttribute('fill', 'var(--color-success)');
  });

  it('skips candles missing any OHLC field', () => {
    const gappy = [OHLC[0], {m: 'B', o: 6, l: 2, c: 3}, OHLC[2]];
    const {plot} = renderMarks([series()], gappy);
    expect(plot.querySelectorAll('rect')).toHaveLength(2);
    expect(plot.querySelectorAll('line')).toHaveLength(2);
  });
});

describe('errorBar', () => {
  it('renders a stem plus two whisker caps per point', () => {
    const {plot} = renderMarks([errorBar({high: 'hi', low: 'lo'})], BOUNDS);
    const lines = plot.querySelectorAll('line');
    expect(lines).toHaveLength(9); // 3 points x (stem + upper cap + lower cap)
    for (const l of lines) {
      expect(l).toHaveAttribute('stroke', 'var(--color-text-primary)');
    }
  });

  it('skips whiskers missing either bound', () => {
    const gappy = [BOUNDS[0], {m: 'B', hi: 8}, BOUNDS[2]];
    const {plot} = renderMarks([errorBar({high: 'hi', low: 'lo'})], gappy);
    expect(plot.querySelectorAll('line')).toHaveLength(6);
  });
});

describe('referenceLine', () => {
  it('draws a dashed horizontal line across the plot with a label badge', () => {
    const {plot} = renderMarks([
      line('v'),
      referenceLine({y: 5, label: 'Target'}),
    ]);
    const dashed = plot.querySelector('line[stroke-dasharray="6 3"]')!;
    expect(dashed).not.toBeNull();
    expect(dashed).toHaveAttribute('x1', '0');
    expect(dashed).toHaveAttribute('x2', '528'); // full plot width
    expect(dashed.getAttribute('y1')).toBe(dashed.getAttribute('y2'));
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(plot.querySelector('rect[rx="3"]')).not.toBeNull(); // badge chip
  });

  it('shades a band between y and y2 bounded by two dashed lines', () => {
    const {plot} = renderMarks([line('v'), referenceLine({y: 2, y2: 6})]);
    expect(plot.querySelectorAll('line[stroke-dasharray="6 3"]')).toHaveLength(
      2,
    );
    const bandRect = plot.querySelector('rect[opacity="0.1"]')!;
    expect(bandRect).not.toBeNull();
    expect(bandRect).toHaveAttribute('width', '528');
  });

  it('draws a vertical dashed line at a numeric x on a linear scale', () => {
    const numeric = [
      {x: 0, v: 1},
      {x: 5, v: 7},
      {x: 10, v: 3},
    ];
    const {plot} = renderMarks(
      [line('v'), referenceLine({x: 5})],
      numeric,
      'x',
    );
    const dashed = plot.querySelector('line[stroke-dasharray="6 3"]')!;
    expect(dashed).not.toBeNull();
    expect(dashed.getAttribute('x1')).toBe(dashed.getAttribute('x2'));
    expect(dashed).toHaveAttribute('y1', '0');
    expect(dashed).toHaveAttribute('y2', '244'); // full plot height
  });
});

describe('GL marks without WebGL', () => {
  let getContextSpy: ReturnType<typeof vi.fn>;
  const canvasProto = HTMLCanvasElement.prototype;
  let originalGetContext: typeof canvasProto.getContext;
  // jsdom has no SVG geometry API; give markers a null CTM so
  // mountCanvasOverSVG takes its documented (0,0) fallback.
  const svgProto = SVGElement.prototype as unknown as {
    getScreenCTM?: () => unknown;
  };
  let hadGetScreenCTM: boolean;

  beforeEach(() => {
    originalGetContext = canvasProto.getContext;
    getContextSpy = vi.fn(() => null);
    canvasProto.getContext =
      getContextSpy as unknown as typeof canvasProto.getContext;
    hadGetScreenCTM = 'getScreenCTM' in svgProto;
    if (!hadGetScreenCTM) {
      svgProto.getScreenCTM = () => null;
    }
  });

  afterEach(() => {
    canvasProto.getContext = originalGetContext;
    if (!hadGetScreenCTM) {
      delete svgProto.getScreenCTM;
    }
  });

  it('dotGL mounts an absolutely-positioned canvas overlay and draws nothing', () => {
    const {container, unmount} = renderMarks([dotGL('v', {color: '#4f46e5'})]);
    const canvas = container.querySelector('canvas')!;
    expect(canvas).not.toBeNull();
    expect(canvas.style.position).toBe('absolute');
    expect(getContextSpy).toHaveBeenCalledWith(
      'webgl',
      expect.objectContaining({alpha: true}),
    );
    // Every context request failed → no GL drawing could have happened.
    expect(getContextSpy.mock.results.every(r => r.value === null)).toBe(true);
    unmount();
  });

  it('heatmapGL mounts its cell canvas when both axes are categorical', () => {
    const heat = [
      {hour: '0', day: 'Mon', count: 1},
      {hour: '1', day: 'Mon', count: 5},
      {hour: '0', day: 'Tue', count: 3},
      {hour: '1', day: 'Tue', count: 2},
    ];
    const {container, unmount} = renderMarks(
      [
        heatmapGL({
          xKey: 'hour',
          yKey: 'day',
          valueKey: 'count',
          colorRange: ['#000000', '#ffffff'],
        }),
      ],
      heat,
      'hour',
    );
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(getContextSpy.mock.results.every(r => r.value === null)).toBe(true);
    unmount();
  });

  it('streamGL exposes an imperative push/clear handle even without WebGL', () => {
    const handleRef: {current: StreamGLHandle | null} = {current: null};
    const {container, unmount} = renderMarks(
      [streamGL({color: '#10b981', handleRef})],
      [],
      'x',
      {xDomain: [0, 10]},
    );
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(handleRef.current).not.toBeNull();
    // Pushing and clearing must not crash when the GL context is unavailable.
    act(() => {
      handleRef.current!.push(1, 2);
      handleRef.current!.push(2, 4);
      handleRef.current!.clear();
    });
    unmount();
  });

  it('dotGLInteractive renders its two canvases and hover hit area without crashing', () => {
    const {plot, unmount} = renderMarks([
      dotGLInteractive('v', {color: '#111111'}),
    ]);
    const foreignObjects = plot.querySelectorAll('foreignObject');
    expect(foreignObjects).toHaveLength(2); // visible + offscreen pick canvas
    expect(foreignObjects[0].querySelector('canvas')).not.toBeNull();
    expect(foreignObjects[1].querySelector('canvas')).not.toBeNull();
    expect(plot.querySelector('rect[fill="transparent"]')).not.toBeNull();
    unmount();
  });
});
