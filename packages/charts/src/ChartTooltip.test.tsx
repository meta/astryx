// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, ChartTooltip, ChartProvider,
 *        d3-scale
 * @output Functional tests for the grouped tooltip — portal lifecycle, pointer
 *         subscription, card content/visibility, hover dots, crosshair vs band
 *         highlight, and the custom render contract
 * @position Colocated test for ChartTooltip.tsx (issue #4295 viz coverage).
 *           Renders under a hand-built ChartProvider so the pointer stream can
 *           be driven directly (jsdom has no SVG geometry for the real one).
 */

import {describe, it, expect, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {scaleLinear, scaleBand} from 'd3-scale';
import {MediaTheme, Theme, defineTheme} from '@astryxdesign/core';
import {ChartTooltip} from './ChartTooltip';
import {ChartProvider} from './ChartContext';
import type {
  ChartContext,
  ChartPointerEvent,
  ResolvedPoint,
  SeriesDef,
} from './types';

const DATA = [
  {month: 'Jan', sales: 3, profit: 1},
  {month: 'Feb', sales: 7, profit: 2},
  {month: 'Mar', sales: 5, profit: 4},
];

const OUTER_THEME = defineTheme({
  name: 'chart-tooltip-outer-test',
  tokens: {'--color-accent': '#112233'},
});
const INNER_THEME = defineTheme({
  name: 'chart-tooltip-inner-test',
  tokens: {'--color-accent': '#445566'},
});

const SALES_POINTS: ResolvedPoint[] = [
  {px: 50, py: 120, py0: 200, dataIndex: 0},
  {px: 250, py: 40, py0: 200, dataIndex: 1},
  {px: 450, py: 80, py0: 200, dataIndex: 2},
];

/** Minimal post-layout series def, annotated the way computeLayout would. */
function makeSeries(overrides: Partial<SeriesDef> = {}): SeriesDef {
  return {
    type: 'line',
    key: 'sales',
    dataKeys: ['sales'],
    label: 'Sales',
    color: '#ff0000',
    layout: {},
    resolve: () => [],
    render: () => null,
    _uid: '0:sales',
    ...overrides,
  } as SeriesDef;
}

interface Harness {
  ctx: ChartContext;
  handlers: Set<(e: ChartPointerEvent) => void>;
  dispatch: (e: ChartPointerEvent) => void;
}

function makeHarness(overrides: Partial<ChartContext> = {}): Harness {
  const handlers = new Set<(e: ChartPointerEvent) => void>();
  const ctx: ChartContext = {
    width: 500,
    height: 200,
    margin: {top: 24, right: 24, bottom: 32, left: 48},
    data: DATA,
    xKey: 'month',
    xScale: scaleBand<string>()
      .domain(['Jan', 'Feb', 'Mar'])
      .range([0, 500])
      .padding(0.2),
    yScale: scaleLinear().domain([0, 10]).range([200, 0]),
    resolved: new Map([['0:sales', SALES_POINTS]]),
    onPointer: handler => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    svgRef: {current: null},
    ...overrides,
  };
  const dispatch = (e: ChartPointerEvent) => {
    act(() => {
      for (const h of handlers) {
        h(e);
      }
    });
  };
  return {ctx, handlers, dispatch};
}

function renderTooltip(
  harness: Harness,
  props: React.ComponentProps<typeof ChartTooltip> = {},
) {
  return render(
    <ChartProvider value={harness.ctx}>
      <svg ref={harness.ctx.svgRef}>
        <g>
          <ChartTooltip series={[makeSeries()]} {...props} />
        </g>
      </svg>
    </ChartProvider>,
  );
}

const hoverAt = (index: number): ChartPointerEvent => ({
  x: SALES_POINTS[index].px,
  y: 100,
  nearest: {...SALES_POINTS[index], seriesKey: 'sales'},
  active: false,
});

const staleHover: ChartPointerEvent = {
  x: 0,
  y: 0,
  nearest: {
    px: 50,
    py: 120,
    py0: 200,
    dataIndex: 99,
    seriesKey: 'sales',
  },
  active: false,
};

const pointerLeave: ChartPointerEvent = {
  x: -1,
  y: -1,
  nearest: null,
  active: false,
};

const card = () => document.querySelector('[role="tooltip"]') as HTMLElement;
const layerHost = () => card().parentElement as HTMLElement;

describe('ChartTooltip card', () => {
  it('portals the fixed Layer host to the nearest chart HTML container', () => {
    const harness = makeHarness();
    const {container} = renderTooltip(harness);
    const svg = container.querySelector('svg');

    expect(card()).not.toBeNull();
    expect(layerHost()).toHaveAttribute('popover', 'manual');
    expect(layerHost().parentElement).toBe(svg?.parentElement);
    // The card keeps local CSS inheritance without becoming invalid SVG.
    expect(svg?.contains(card())).toBe(false);
    expect(card().textContent).toBe('');
  });

  it('keeps the Layer host inside nested Theme and MediaTheme scopes', () => {
    const harness = makeHarness();
    const {container} = render(
      <Theme theme={OUTER_THEME}>
        <Theme theme={INNER_THEME}>
          <MediaTheme mode="dark">
            <ChartProvider value={harness.ctx}>
              <svg ref={harness.ctx.svgRef}>
                <g>
                  <ChartTooltip series={[makeSeries()]} />
                </g>
              </svg>
            </ChartProvider>
          </MediaTheme>
        </Theme>
      </Theme>,
    );

    const innerTheme = container.querySelector(
      '[data-astryx-theme="chart-tooltip-inner-test"]',
    );
    const mediaTheme = container.querySelector('[data-astryx-media="dark"]');
    expect(innerTheme).not.toBeNull();
    expect(mediaTheme).not.toBeNull();
    expect(innerTheme?.contains(layerHost())).toBe(true);
    expect(mediaTheme?.contains(layerHost())).toBe(true);
  });

  it('shows the hovered x value and the bare value for a single series', () => {
    const harness = makeHarness();
    renderTooltip(harness);
    harness.dispatch(hoverAt(1));
    expect(card().textContent).toContain('Feb');
    expect(card().textContent).toContain('7');
  });

  it('lists a labeled row per series for multi-series charts', () => {
    const profitPoints = SALES_POINTS.map(p => ({...p, py: p.py + 30}));
    const harness = makeHarness({
      resolved: new Map([
        ['0:sales', SALES_POINTS],
        ['1:profit', profitPoints],
      ]),
    });
    const series = [
      makeSeries(),
      makeSeries({
        key: 'profit',
        dataKeys: ['profit'],
        label: 'Profit',
        _uid: '1:profit',
      }),
    ];
    renderTooltip(harness, {series});
    harness.dispatch(hoverAt(1));
    expect(card().textContent).toContain('Sales');
    expect(card().textContent).toContain('7');
    expect(card().textContent).toContain('Profit');
    expect(card().textContent).toContain('2');
  });

  it('reveals the card on hover and hides it again when the pointer leaves', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const harness = makeHarness({svgRef: {current: svgEl}});

    try {
      renderTooltip(harness);
      harness.dispatch(hoverAt(0));
      expect(showSpy).toHaveBeenCalledOnce();

      harness.dispatch(pointerLeave);
      expect(hideSpy).toHaveBeenCalledOnce();
    } finally {
      showSpy.mockRestore();
      hideSpy.mockRestore();
    }
  });

  it('keeps the Layer open while moving between valid data points', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
    const harness = makeHarness();

    try {
      renderTooltip(harness);
      harness.dispatch(hoverAt(0));
      const openHost = layerHost();
      expect(card().textContent).toContain('Jan');

      harness.dispatch(hoverAt(1));

      expect(layerHost()).toBe(openHost);
      expect(card().textContent).toContain('Feb');
      expect(showSpy).toHaveBeenCalledOnce();
      expect(hideSpy).not.toHaveBeenCalled();

      harness.dispatch(pointerLeave);
      expect(hideSpy).toHaveBeenCalledOnce();

      harness.dispatch(hoverAt(2));
      expect(layerHost()).toBe(openHost);
      expect(card().textContent).toContain('Mar');
      expect(showSpy).toHaveBeenCalledTimes(2);
    } finally {
      showSpy.mockRestore();
      hideSpy.mockRestore();
    }
  });

  it('measures native Popover geometry after revealing the first card', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('popover') && this.style.display !== 'none'
          ? 120
          : 0;
      });
    const heightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute('popover') && this.style.display !== 'none'
          ? 40
          : 0;
      });
    const harness = makeHarness();

    try {
      renderTooltip(harness, {placement: 'left'});
      harness.dispatch(hoverAt(1));

      expect(showSpy).toHaveBeenCalledOnce();
      // svgLeft(0) + marginLeft(48) + px(250) - width(120) - gap(8)
      expect(layerHost().style.left).toBe('170px');
    } finally {
      showSpy.mockRestore();
      widthSpy.mockRestore();
      heightSpy.mockRestore();
    }
  });

  it('keeps the non-Popover fallback hidden until hover', async () => {
    const showDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'showPopover',
    );
    const hideDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'hidePopover',
    );
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const harness = makeHarness({svgRef: {current: svgEl}});

    try {
      renderTooltip(harness);
      expect(layerHost().style.display).toBe('none');

      harness.dispatch(hoverAt(0));
      const openHost = layerHost();
      expect(openHost.style.display).not.toBe('none');
      expect(card().textContent).toContain('Jan');

      const priorStyles: Array<string | null> = [];
      const observer = new MutationObserver(records => {
        for (const record of records) {
          priorStyles.push(record.oldValue);
        }
      });
      observer.observe(openHost, {
        attributeFilter: ['style'],
        attributeOldValue: true,
        attributes: true,
      });

      harness.dispatch(hoverAt(1));
      await Promise.resolve();
      observer.disconnect();
      expect(layerHost()).toBe(openHost);
      expect(card().textContent).toContain('Feb');
      expect(openHost.style.display).not.toBe('none');
      expect(priorStyles.some(style => style?.includes('display: none'))).toBe(
        false,
      );

      harness.dispatch(pointerLeave);
      expect(openHost.style.display).toBe('none');
    } finally {
      if (showDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'showPopover',
          showDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
      }
      if (hideDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          'hidePopover',
          hideDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
      }
    }
  });

  it('pins the card beside the hovered point for placement="right"', () => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const harness = makeHarness({svgRef: {current: svgEl}});
    renderTooltip(harness, {placement: 'right'});
    harness.dispatch(hoverAt(1));
    // jsdom rects are zero, so left = svgLeft(0) + margin.left(48) + px(250)
    // + the 8px gap.
    expect(layerHost().style.left).toBe('306px');
  });

  it('does not open the card when the hovered index no longer exists in data', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
    const harness = makeHarness();

    try {
      renderTooltip(harness);
      harness.dispatch(staleHover);
      expect(card().textContent).toBe('');
      expect(showSpy).not.toHaveBeenCalled();
      expect(hideSpy).not.toHaveBeenCalled();
    } finally {
      showSpy.mockRestore();
      hideSpy.mockRestore();
    }
  });

  it('closes an open card for a stale index and reopens for later valid data', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
    const harness = makeHarness();

    try {
      renderTooltip(harness);
      harness.dispatch(hoverAt(0));
      expect(card().textContent).toContain('Jan');

      harness.dispatch(staleHover);
      expect(card().textContent).toBe('');
      expect(hideSpy).toHaveBeenCalledOnce();

      harness.dispatch(hoverAt(1));
      expect(card().textContent).toContain('Feb');
      expect(showSpy).toHaveBeenCalledTimes(2);
    } finally {
      showSpy.mockRestore();
      hideSpy.mockRestore();
    }
  });
});

describe('ChartTooltip hover indicators', () => {
  it('marks the hovered point of each series with a dot in the series color', () => {
    const harness = makeHarness();
    const {container} = renderTooltip(harness);
    harness.dispatch(hoverAt(1));
    const dot = container.querySelector('circle')!;
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute('cx', '250');
    expect(dot).toHaveAttribute('cy', '40');
    expect(dot).toHaveAttribute('stroke', '#ff0000');
  });

  it('skips the hover dot when the series value is missing at that index', () => {
    const gappy = SALES_POINTS.map((p, i) => (i === 1 ? {...p, py: NaN} : p));
    const harness = makeHarness({resolved: new Map([['0:sales', gappy]])});
    const {container} = renderTooltip(harness);
    harness.dispatch(hoverAt(1));
    expect(container.querySelector('circle')).toBeNull();
  });

  it('draws a vertical crosshair through the hovered x for line charts', () => {
    const harness = makeHarness();
    const {container} = renderTooltip(harness);
    harness.dispatch(hoverAt(1));
    const crosshair = container.querySelector('line')!;
    expect(crosshair).not.toBeNull();
    expect(crosshair.getAttribute('x1')).toBe(crosshair.getAttribute('x2'));
    expect(crosshair).toHaveAttribute('y1', '0');
    expect(crosshair).toHaveAttribute('y2', '200');
  });

  it('draws a soft band-highlight rect instead of a crosshair when the chart has bars', () => {
    const harness = makeHarness();
    const {container} = renderTooltip(harness, {
      series: [makeSeries({type: 'bar'})],
    });
    harness.dispatch(hoverAt(1));
    expect(container.querySelector('line')).toBeNull();
    const highlight = container.querySelector('rect')!;
    expect(highlight).not.toBeNull();
    expect(Number(highlight.getAttribute('width'))).toBeGreaterThan(0);
  });
});

describe('ChartTooltip custom render', () => {
  it('replaces the card body and receives the x value plus one row per series', () => {
    const renderFn = vi.fn(() => <span>custom body</span>);
    const harness = makeHarness();
    renderTooltip(harness, {render: renderFn});
    harness.dispatch(hoverAt(1));
    expect(card().textContent).toBe('custom body');
    expect(renderFn).toHaveBeenCalledWith('Feb', [
      expect.objectContaining({key: 'sales', label: 'Sales', value: 7}),
    ]);
  });

  it('never opens the card when the custom render opts out with null', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
    const harness = makeHarness();

    try {
      renderTooltip(harness, {render: () => null});
      harness.dispatch(hoverAt(1));
      expect(card().textContent).toBe('');
      expect(showSpy).not.toHaveBeenCalled();
      expect(hideSpy).not.toHaveBeenCalled();
    } finally {
      showSpy.mockRestore();
      hideSpy.mockRestore();
    }
  });

  it('closes for custom null content and reopens for later content', () => {
    const showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
    const hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
    const harness = makeHarness();

    try {
      renderTooltip(harness, {
        render: xValue =>
          xValue === 'Feb' ? null : <span>{String(xValue)}</span>,
      });
      harness.dispatch(hoverAt(0));
      expect(card().textContent).toBe('Jan');

      harness.dispatch(hoverAt(1));
      expect(card().textContent).toBe('');
      expect(hideSpy).toHaveBeenCalledOnce();

      harness.dispatch(hoverAt(2));
      expect(card().textContent).toBe('Mar');
      expect(showSpy).toHaveBeenCalledTimes(2);
    } finally {
      showSpy.mockRestore();
      hideSpy.mockRestore();
    }
  });
});

describe('ChartTooltip server rendering', () => {
  it('omits the browser-only layer without a document', () => {
    const harness = makeHarness();
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    );

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: undefined,
    });
    try {
      const markup = renderToString(
        <ChartProvider value={harness.ctx}>
          <svg>
            <g>
              <ChartTooltip series={[makeSeries()]} />
            </g>
          </svg>
        </ChartProvider>,
      );
      expect(markup).not.toContain('role="tooltip"');
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, 'document', documentDescriptor);
      }
    }
  });
});

describe('ChartTooltip lifecycle', () => {
  it('removes the portal and unsubscribes from the pointer stream on unmount', () => {
    const harness = makeHarness();
    const {unmount} = renderTooltip(harness);
    expect(harness.handlers.size).toBe(1);
    unmount();
    expect(card()).toBeNull();
    expect(harness.handlers.size).toBe(0);
  });
});
