// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/dotGLInteractive.test.tsx
 * @input Chart with a dotGLInteractive series over a fake WebGL context whose
 *   pick framebuffer reports a point index chosen by each test
 * @output Proof that a pointer event on Chart's pointer layer, from a mouse, a
 *   pen or a touch, reaches the mark, reads the pick pixel under the cursor and
 *   fills the point card with that point's values
 * @position Charts unit tests. jsdom has no WebGL, layout or hit testing, so
 *   the GPU pick, the card's geometry and top-layer promotion are proved in a
 *   real browser by the WebGL Interactive scatter story's play function.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, act, fireEvent} from '@testing-library/react';
import {flushSync} from 'react-dom';
import type * as ReactDOM from 'react-dom';
import {Chart} from '../Chart';
import {dotGLInteractive} from './dotGLInteractive';

// Count synchronous commits; the real flushSync still runs.
vi.mock('react-dom', async importOriginal => {
  const actual = await importOriginal<typeof ReactDOM>();
  return {...actual, flushSync: vi.fn(actual.flushSync)};
});

const DATA = [
  {x: 10, y: 20},
  {x: 30, y: 45},
  {x: 70, y: 80},
];

/** Chart defaults: 600px reported width, height 300, margins 24/24/32/48. */
const PLOT_HEIGHT = 300 - 24 - 32;

interface PickRead {
  readonly x: number;
  readonly y: number;
}

/**
 * The point index the fake pick framebuffer holds at each pixel (in
 * framebuffer coordinates, bottom-left origin). Unlisted pixels are
 * background.
 */
let pickPixels: Map<string, number>;
let pickReads: PickRead[];

function fakeGL(canvas: HTMLCanvasElement): unknown {
  const target: Record<string, unknown> = {
    canvas,
    isContextLost: () => false,
    getExtension: () => null,
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    readPixels: (
      x: number,
      y: number,
      _w: number,
      _h: number,
      _format: number,
      _type: number,
      out: Uint8Array,
    ) => {
      pickReads.push({x, y});
      const index = pickPixels.get(`${x},${y}`);
      // The mark encodes point i as the 24-bit color i + 1; 0 is background.
      const id = index == null ? 0 : index + 1;
      out[0] = (id >> 16) & 0xff;
      out[1] = (id >> 8) & 0xff;
      out[2] = id & 0xff;
      out[3] = 255;
    },
  };
  return new Proxy(target, {
    get(t, property) {
      if (typeof property !== 'string') {
        return undefined;
      }
      if (property in t) {
        return t[property];
      }
      // GL enums are upper-case constants; everything else is a no-op call.
      return /^[A-Z0-9_]+$/.test(property) ? 1 : () => undefined;
    },
  });
}

let resizeCallback: ResizeObserverCallback | undefined;
const canvasProto = HTMLCanvasElement.prototype;
let originalGetContext: typeof canvasProto.getContext;
const glByCanvas = new Map<HTMLCanvasElement, unknown>();
const svgElementProto = SVGElement.prototype as unknown as {
  getScreenCTM?: () => unknown;
};
const svgRootProto = SVGSVGElement.prototype as unknown as {
  createSVGPoint?: () => unknown;
};
let savedGetScreenCTM: PropertyDescriptor | undefined;
let savedCreateSVGPoint: PropertyDescriptor | undefined;

beforeEach(() => {
  pickPixels = new Map();
  pickReads = [];
  glByCanvas.clear();
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
  originalGetContext = canvasProto.getContext;
  canvasProto.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== 'webgl') {
      return null;
    }
    if (!glByCanvas.has(this)) {
      glByCanvas.set(this, fakeGL(this));
    }
    return glByCanvas.get(this);
  } as unknown as typeof canvasProto.getContext;
  // jsdom has no SVG geometry. An identity screen matrix makes the client
  // coordinates of a pointer event the plot coordinates Chart dispatches.
  savedGetScreenCTM = Object.getOwnPropertyDescriptor(
    svgElementProto,
    'getScreenCTM',
  );
  savedCreateSVGPoint = Object.getOwnPropertyDescriptor(
    svgRootProto,
    'createSVGPoint',
  );
  svgElementProto.getScreenCTM = () => ({inverse: () => ({})});
  svgRootProto.createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform(this: {x: number; y: number}) {
      return {x: this.x, y: this.y};
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  canvasProto.getContext = originalGetContext;
  if (savedGetScreenCTM) {
    Object.defineProperty(svgElementProto, 'getScreenCTM', savedGetScreenCTM);
  } else {
    delete svgElementProto.getScreenCTM;
  }
  if (savedCreateSVGPoint) {
    Object.defineProperty(svgRootProto, 'createSVGPoint', savedCreateSVGPoint);
  } else {
    delete svgRootProto.createSVGPoint;
  }
});

function renderScatter(
  options: Partial<Parameters<typeof dotGLInteractive>[1]> = {},
) {
  const utils = render(
    <Chart
      data={DATA}
      xKey="x"
      series={[dotGLInteractive('y', {color: '#111111', ...options})]}
    />,
  );
  act(() => {
    resizeCallback?.(
      [{contentRect: {width: 600}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
  const relayout = (width: number) =>
    act(() => {
      resizeCallback?.(
        [{contentRect: {width}} as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });
  const svg = utils.container.querySelector('svg')!;
  const plot = svg.querySelector('g[clip-path]')!;
  // Chart's pointer layer: the transparent rect outside the clipped marks.
  const pointerLayer = Array.from(
    svg.querySelectorAll('rect[fill="transparent"]'),
  ).find(rect => !plot.contains(rect)) as SVGRectElement | undefined;
  const cardText = () =>
    document.querySelector('[role="tooltip"]')?.textContent ?? '';
  return {...utils, plot, pointerLayer, cardText, relayout};
}

/** The framebuffer pixel a plot-space cursor reads at devicePixelRatio 1. */
function framebufferPixel(x: number, y: number): string {
  return `${Math.floor(x)},${PLOT_HEIGHT - 1 - Math.floor(y)}`;
}

describe('dotGLInteractive pointer wiring', () => {
  it('draws no hit target of its own inside the clipped marks', () => {
    const {plot, pointerLayer} = renderScatter();
    expect(plot.querySelector('rect')).toBeNull();
    expect(pointerLayer).toBeDefined();
  });

  it.each(['mouse', 'pen', 'touch'])(
    'a %s move on the chart pointer layer picks the point under the cursor',
    pointerType => {
      const {pointerLayer, cardText, plot} = renderScatter();
      pickPixels.set(framebufferPixel(200.6, 90.2), 1);

      fireEvent.pointerMove(pointerLayer!, {
        clientX: 200.6,
        clientY: 90.2,
        pointerType,
      });

      expect(pickReads).toEqual([{x: 200, y: PLOT_HEIGHT - 1 - 90}]);
      // Default card body: the x value, then the series value of point 1.
      expect(cardText()).toBe('3045');
      // The halo and the solid marker of the hovered point.
      expect(plot.querySelectorAll('circle')).toHaveLength(2);
    },
  );

  it('clears the card over background and when the pointer leaves', () => {
    const {pointerLayer, cardText, plot} = renderScatter();
    pickPixels.set(framebufferPixel(40, 50), 2);

    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    expect(cardText()).toBe('7080');

    fireEvent.pointerMove(pointerLayer!, {clientX: 300, clientY: 50});
    expect(cardText()).toBe('');
    expect(plot.querySelectorAll('circle')).toHaveLength(0);

    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    expect(cardText()).toBe('7080');
    fireEvent.pointerLeave(pointerLayer!);
    expect(cardText()).toBe('');
  });

  it('passes the picked datum and index to renderTooltip', () => {
    const renderTooltip = vi.fn(
      (d: Record<string, unknown>, i: number) => `#${i} at ${String(d.x)}`,
    );
    const {pointerLayer, cardText} = renderScatter({renderTooltip});
    pickPixels.set(framebufferPixel(12, 34), 0);

    fireEvent.pointerMove(pointerLayer!, {clientX: 12, clientY: 34});

    expect(renderTooltip).toHaveBeenLastCalledWith(DATA[0], 0);
    expect(cardText()).toBe('#0 at 10');
  });

  it('clears the halo and the card on the first miss or leave after a re-layout', () => {
    for (const leave of [false, true]) {
      const {pointerLayer, cardText, plot, relayout, unmount} = renderScatter();
      pickPixels.set(framebufferPixel(40, 50), 2);
      fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
      expect(cardText()).toBe('7080');
      expect(plot.querySelectorAll('circle')).toHaveLength(2);

      // A new width moves every point, so the mark subscribes again.
      relayout(640);
      if (leave) {
        fireEvent.pointerLeave(pointerLayer!);
      } else {
        fireEvent.pointerMove(pointerLayer!, {clientX: 300, clientY: 50});
      }

      expect(cardText()).toBe('');
      expect(plot.querySelectorAll('circle')).toHaveLength(0);
      unmount();
    }
  });

  it('commits synchronously only when the hovered point changes', () => {
    const {pointerLayer, cardText} = renderScatter();
    pickPixels.set(framebufferPixel(40, 50), 2);
    pickPixels.set(framebufferPixel(41, 50), 2);
    pickPixels.set(framebufferPixel(200.6, 90.2), 1);
    const sync = vi.mocked(flushSync);
    sync.mockClear();

    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    const firstOpen = sync.mock.calls.length;
    expect(firstOpen).toBeGreaterThan(0);

    // More moves over the same point: no synchronous commit.
    fireEvent.pointerMove(pointerLayer!, {clientX: 41, clientY: 50});
    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    expect(sync.mock.calls.length).toBe(firstOpen);
    expect(cardText()).toBe('7080');

    // Another point commits again, with its own body.
    fireEvent.pointerMove(pointerLayer!, {clientX: 200.6, clientY: 90.2});
    expect(sync.mock.calls.length).toBe(firstOpen * 2);
    expect(cardText()).toBe('3045');
  });

  it('moves the card with the chart when the page scrolls over the same point', () => {
    const {pointerLayer, container} = renderScatter();
    const svg = container.querySelector('svg')!;
    let svgLeft = 0;
    vi.spyOn(svg, 'getBoundingClientRect').mockImplementation(
      () => ({left: svgLeft, top: 0, right: 0, bottom: 0}) as DOMRect,
    );
    const cardLeft = () =>
      parseFloat(
        (
          document.querySelector('[role="tooltip"]')!
            .parentElement as HTMLElement
        ).style.left,
      );
    pickPixels.set(framebufferPixel(40, 50), 2);
    pickPixels.set(framebufferPixel(41, 50), 2);
    const sync = vi.mocked(flushSync);

    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    const before = cardLeft();
    const commits = sync.mock.calls.length;

    // The page scrolls and the chart moves 60px; the next move is over the
    // same point.
    svgLeft = 60;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    fireEvent.pointerMove(pointerLayer!, {clientX: 41, clientY: 50});

    expect(cardLeft()).toBe(before + 60);
    expect(sync.mock.calls.length).toBe(commits);
  });

  it('reads no layout on moves over the same point while nothing moved', () => {
    const {pointerLayer, container} = renderScatter();
    const svg = container.querySelector('svg')!;
    const rectReads = vi.spyOn(svg, 'getBoundingClientRect');
    pickPixels.set(framebufferPixel(40, 50), 2);
    pickPixels.set(framebufferPixel(41, 50), 2);

    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    const reads = rectReads.mock.calls.length;
    expect(reads).toBeGreaterThan(0);

    fireEvent.pointerMove(pointerLayer!, {clientX: 41, clientY: 50});
    fireEvent.pointerMove(pointerLayer!, {clientX: 40, clientY: 50});
    expect(rectReads.mock.calls.length).toBe(reads);
  });
});
