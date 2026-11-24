// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file glEffectReplay.test.tsx
 * @input dotGL, dotGLInteractive, heatmapGL and streamGL inside a Chart, under
 *   StrictMode and inside an Activity boundary that hides and shows, over a
 *   fake WebGL context that behaves like a browser's: one context per canvas,
 *   a context lost through WEBGL_lose_context stays lost, and restoreContext()
 *   works only after a listener prevented the lost event
 * @output Proof that each WebGL mark draws again after React runs its effect
 *   cleanups and then its effects on the same instance
 * @position Charts unit tests; the no-WebGL fallbacks are in marks.test.tsx
 */

import {Activity, StrictMode, type ReactNode} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, act} from '@testing-library/react';
import {Chart} from '../Chart';
import {dotGL} from './dotGL';
import {dotGLInteractive} from './dotGLInteractive';
import {heatmapGL} from './heatmapGL';
import {streamGL, type StreamGLHandle} from './streamGL';
import type {SeriesDef} from '../types';

interface FakeContext {
  readonly isContextLost: () => boolean;
  /** Draw calls made while the context was live. */
  liveDraws: number;
}

const contexts = new Map<HTMLCanvasElement, FakeContext>();

/**
 * A WebGL context that keeps the browser rules these marks depend on. While
 * the context is lost, getExtension and every create call return null, as a
 * browser's do.
 */
function fakeContext(canvas: HTMLCanvasElement): FakeContext {
  let isLost = false;
  // Whether a listener prevented the last webglcontextlost event. A browser
  // refuses restoreContext() otherwise.
  let isRestorable = false;
  const state: FakeContext = {isContextLost: () => isLost, liveDraws: 0};
  const extension = {
    loseContext() {
      isLost = true;
      isRestorable = false;
      // A browser fires the lost event later, not inside this call.
      queueMicrotask(() => {
        isRestorable = !canvas.dispatchEvent(
          new Event('webglcontextlost', {cancelable: true}),
        );
      });
    },
    restoreContext() {
      if (!isLost || !isRestorable) {
        return;
      }
      isLost = false;
      queueMicrotask(() =>
        canvas.dispatchEvent(new Event('webglcontextrestored')),
      );
    },
  };
  const live =
    <T,>(value: T) =>
    () =>
      isLost ? null : value;
  const overrides: Record<string, unknown> = {
    isContextLost: () => isLost,
    getExtension: (name: string) =>
      !isLost && name === 'WEBGL_lose_context' ? extension : null,
    createShader: live({}),
    createProgram: live({}),
    createBuffer: live({}),
    createTexture: live({}),
    createFramebuffer: live({}),
    getShaderParameter: () => !isLost,
    getProgramParameter: () => !isLost,
    checkFramebufferStatus: () => 0x8cd5,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    getError: () => 0,
    drawArrays: () => {
      if (!isLost) {
        state.liveDraws += 1;
      }
    },
    canvas,
  };
  const gl = new Proxy(overrides, {
    get(target, property) {
      if (typeof property !== 'string') {
        return undefined;
      }
      if (property in target) {
        return target[property];
      }
      // GL enums are upper-case constants; everything else is a no-op call.
      return /^[A-Z0-9_]+$/.test(property) ? 1 : () => undefined;
    },
  });
  contexts.set(canvas, state);
  (canvas as unknown as {fakeGL: unknown}).fakeGL = gl;
  return state;
}

let resizeCallback: ResizeObserverCallback | undefined;
const canvasProto = HTMLCanvasElement.prototype;
let originalGetContext: typeof canvasProto.getContext;
const svgProto = SVGElement.prototype as unknown as {
  getScreenCTM?: () => unknown;
};
let hadGetScreenCTM: boolean;

beforeEach(() => {
  contexts.clear();
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
  // Frames run on the next microtask, so a test's settle() flushes them.
  const cancelled = new Set<number>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++nextFrame;
    queueMicrotask(() => {
      if (!cancelled.delete(id)) {
        cb(0);
      }
    });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => cancelled.add(id));
  originalGetContext = canvasProto.getContext;
  // One context per canvas, as in a browser: a second request returns the
  // first context, lost or not.
  canvasProto.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== 'webgl') {
      return null;
    }
    if (!contexts.has(this)) {
      fakeContext(this);
    }
    return (this as unknown as {fakeGL: unknown}).fakeGL;
  } as unknown as typeof canvasProto.getContext;
  hadGetScreenCTM = 'getScreenCTM' in svgProto;
  if (!hadGetScreenCTM) {
    svgProto.getScreenCTM = () => null;
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  canvasProto.getContext = originalGetContext;
  if (!hadGetScreenCTM) {
    delete svgProto.getScreenCTM;
  }
});

function reportWidth(width: number) {
  act(() => {
    resizeCallback?.(
      [{contentRect: {width}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

const DOTS = [
  {m: 'A', v: 4},
  {m: 'B', v: 7},
  {m: 'C', v: 2},
];

const HEAT = [
  {hour: '0', day: 'Mon', count: 1},
  {hour: '1', day: 'Mon', count: 5},
  {hour: '0', day: 'Tue', count: 3},
  {hour: '1', day: 'Tue', count: 2},
];

interface MarkCase {
  readonly name: string;
  readonly series: () => SeriesDef[];
  readonly data: Record<string, unknown>[];
  readonly xKey: string;
  readonly extra?: Partial<React.ComponentProps<typeof Chart>>;
  /** Makes the mark draw once its context is live. */
  readonly feed?: () => void;
}

const streamHandle: {current: StreamGLHandle | null} = {current: null};

const CASES: MarkCase[] = [
  {
    name: 'dotGL',
    series: () => [dotGL('v', {color: '#4f46e5'})],
    data: DOTS,
    xKey: 'm',
  },
  {
    name: 'dotGLInteractive',
    series: () => [dotGLInteractive('v', {color: '#111111'})],
    data: DOTS,
    xKey: 'm',
  },
  {
    name: 'heatmapGL',
    series: () => [
      heatmapGL({
        xKey: 'hour',
        yKey: 'day',
        valueKey: 'count',
        colorRange: ['#000000', '#ffffff'],
      }),
    ],
    data: HEAT,
    xKey: 'hour',
  },
  {
    name: 'streamGL',
    series: () => [streamGL({color: '#10b981', handleRef: streamHandle})],
    data: [],
    xKey: 'x',
    extra: {xDomain: [0, 10], yDomain: [0, 10]},
    feed: () => {
      act(() => {
        streamHandle.current?.push(1, 2);
        streamHandle.current?.push(2, 4);
      });
    },
  },
];

function chart(mark: MarkCase): ReactNode {
  return (
    <Chart
      data={mark.data}
      xKey={mark.xKey}
      series={mark.series()}
      {...mark.extra}
    />
  );
}

/** The context of the canvas the mark shows now, and its live draws. */
function shownCanvasContext(container: HTMLElement): FakeContext {
  const shown = [...container.querySelectorAll('canvas')].filter(
    canvas => contexts.has(canvas) && canvas.style.display !== 'none',
  );
  expect(shown.length, 'a canvas with a context is shown').toBeGreaterThan(0);
  return contexts.get(shown[0])!;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('WebGL marks after their effects run again', () => {
  for (const mark of CASES) {
    it(`${mark.name} draws again under StrictMode's effect replay`, async () => {
      const {container, unmount} = render(
        <StrictMode>{chart(mark)}</StrictMode>,
      );
      reportWidth(600);
      await settle();
      mark.feed?.();
      await settle();
      const gl = shownCanvasContext(container);
      expect(gl.isContextLost()).toBe(false);
      expect(gl.liveDraws).toBeGreaterThan(0);
      unmount();
    });

    it(`${mark.name} draws again after an Activity boundary hides and shows it`, async () => {
      const view = (mode: 'visible' | 'hidden') => (
        <Activity mode={mode}>{chart(mark)}</Activity>
      );
      const {container, rerender, unmount} = render(view('visible'));
      reportWidth(600);
      await settle();
      rerender(view('hidden'));
      await settle();
      rerender(view('visible'));
      await settle();
      reportWidth(600);
      mark.feed?.();
      await settle();
      const gl = shownCanvasContext(container);
      expect(gl.isContextLost()).toBe(false);
      expect(gl.liveDraws).toBeGreaterThan(0);
      unmount();
    });
  }
});
