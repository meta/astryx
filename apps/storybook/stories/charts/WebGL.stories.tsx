// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {expect, waitFor} from 'storybook/test';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {Button, HStack, VStack} from '@astryxdesign/core';
import {
  Chart,
  dotGL,
  dotGLInteractive,
  heatmapGL,
  streamGL,
  type StreamGLHandle,
  ChartGrid,
  ChartAxis,
} from '@astryxdesign/charts';
import {createStreamSamples, scatterData, heatmapData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Marks/WebGL',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/**
 * Static, high-performance GPU scatter (`dotGL`) — one draw call, scales to
 * tens of thousands of points. Intentionally has NO hover/tooltip; for
 * interactivity see "Interactive scatter" below.
 */
export const Scatter: StoryObj = {
  name: 'Scatter — static (high-performance)',
  render: () => (
    <Chart
      data={scatterData}
      xKey="x"
      title="WebGL scatter — static (dotGL)"
      series={[dotGL('y', {color: '#3b82f6', size: 5})]}
      grid={<ChartGrid horizontal vertical />}
      axes={axes}
      height={400}
    />
  ),
};

/**
 * GPU scatter with color-picking hover (`dotGLInteractive`). Point at a dot
 * with a mouse or a pen: the dot gets a halo, and a card beside it shows that
 * dot's rounded x and y. Hit detection is O(1) regardless of point count.
 * Touch opens no card: as with every chart's tooltip, the browser takes a
 * touch drag for scrolling.
 *
 * To check: hover a dot, then compare the card with the axes. Hover a dot near
 * the right or top edge of the plot: the card stays whole, outside the plot
 * and above the axes. Move off the dots and the card closes.
 */
export const InteractiveScatter: StoryObj = {
  name: 'Interactive scatter — hover + tooltip',
  render: () => (
    <Chart
      data={scatterData}
      xKey="x"
      title="WebGL scatter — interactive hover (dotGLInteractive)"
      series={[
        dotGLInteractive('y', {
          color: '#6b1efd',
          size: 6,
          renderTooltip: (d: Record<string, unknown>) => (
            <span>
              x: {Math.round(d.x as number)}, y: {Math.round(d.y as number)}
            </span>
          ),
        }),
      ]}
      grid={<ChartGrid horizontal vertical />}
      axes={axes}
      height={400}
    />
  ),
  play: async ({canvasElement}) => {
    const doc = canvasElement.ownerDocument;
    const view = doc.defaultView ?? window;
    const getSvg = () => canvasElement.querySelector<SVGSVGElement>('svg');
    // Chart's pointer layer is the transparent rect outside the clipped marks.
    const getEventSurface = () =>
      Array.from(
        canvasElement.querySelectorAll<SVGRectElement>(
          'svg rect[fill="transparent"]',
        ),
      ).find(rect => rect.closest('g[clip-path]') == null) ?? null;
    const getTooltip = () =>
      canvasElement.querySelector<HTMLElement>('[role="tooltip"]');
    const isTooltipOpen = () =>
      getTooltip()?.parentElement?.matches(':popover-open') ?? false;
    const axisTicks = (side: 'bottom' | 'left') =>
      Array.from(
        canvasElement.querySelectorAll<SVGTextElement>(
          `g[aria-label="${side} axis"] text`,
        ),
      )
        .filter(tick => tick.textContent?.trim())
        .map(tick => {
          const rect = tick.getBoundingClientRect();
          return {
            value: Number(tick.textContent),
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        })
        .filter(tick => Number.isFinite(tick.value));

    await waitFor(() => {
      expect(getSvg()?.querySelector('canvas')).not.toBeNull();
      expect(getEventSurface()?.getBoundingClientRect().width).toBeGreaterThan(
        0,
      );
      expect(axisTicks('bottom').length).toBeGreaterThanOrEqual(2);
      expect(axisTicks('left').length).toBeGreaterThanOrEqual(2);
    });
    const svg = getSvg();
    const eventSurface = getEventSurface();
    if (!svg || !eventSurface) {
      throw new Error('Chart or its pointer layer did not render');
    }

    // The oracle places each datum through the rendered axis ticks, not
    // through the chart's scales.
    const project = (
      ticks: ReturnType<typeof axisTicks>,
      axis: 'x' | 'y',
      value: number,
    ) => {
      const first = ticks[0];
      const last = ticks[ticks.length - 1];
      return (
        first[axis] +
        ((value - first.value) * (last[axis] - first[axis])) /
          (last.value - first.value)
      );
    };
    const xTicks = axisTicks('bottom');
    const yTicks = axisTicks('left');
    const plot = eventSurface.getBoundingClientRect();
    const points = scatterData.map((d, index) => ({
      index,
      x: project(xTicks, 'x', d.x),
      y: project(yTicks, 'y', d.y),
      text: `x: ${Math.round(d.x)}, y: ${Math.round(d.y)}`,
    }));
    // A pick returns the topmost dot whose pick disc (dot size plus hit
    // padding: 22px wide) covers the pixel. Later data draws on top, so a dot
    // is a clean target when no later dot is within that radius.
    const clearRadius = 13;
    const targets = points.filter(
      p =>
        p.x > plot.left + 2 &&
        p.x < plot.right - 2 &&
        p.y > plot.top + 2 &&
        p.y < plot.bottom - 2 &&
        points.every(
          q =>
            q.index <= p.index ||
            Math.hypot(q.x - p.x, q.y - p.y) > clearRadius,
        ),
    );

    // One target in each cell of a 5 x 4 grid over the plot.
    const columns = 5;
    const rows = 4;
    const grid: (typeof targets)[number][] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const left = plot.left + (plot.width * column) / columns;
        const top = plot.top + (plot.height * row) / rows;
        const width = plot.width / columns;
        const height = plot.height / rows;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const inCell = targets.filter(
          p =>
            p.x >= left &&
            p.x < left + width &&
            p.y >= top &&
            p.y < top + height,
        );
        inCell.sort(
          (a, b) =>
            Math.hypot(a.x - centerX, a.y - centerY) -
            Math.hypot(b.x - centerX, b.y - centerY),
        );
        if (inCell.length === 0) {
          throw new Error(`No clean target dot in grid cell ${row},${column}`);
        }
        grid.push(inCell[0]);
      }
    }

    const pointerTypes = ['mouse', 'pen'];
    const hover = async (
      target: (typeof targets)[number],
      pointerType: string,
    ) => {
      // A real pointer reaches Chart's pointer layer only if nothing painted
      // above it takes the hit.
      expect(doc.elementFromPoint(target.x, target.y)).toBe(eventSurface);
      eventSurface.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: target.x,
          clientY: target.y,
          pointerType,
        }),
      );
      await waitFor(
        () => {
          expect(isTooltipOpen()).toBe(true);
          expect(getTooltip()?.textContent).toBe(target.text);
        },
        {timeout: 500},
      );
    };

    const misses: string[] = [];
    for (const [i, target] of grid.entries()) {
      const pointerType = pointerTypes[i % pointerTypes.length];
      try {
        await hover(target, pointerType);
      } catch {
        misses.push(
          `${pointerType} at datum ${target.index} (${target.text}) showed ` +
            `"${isTooltipOpen() ? getTooltip()?.textContent : 'no card'}"`,
        );
      }
    }
    expect(`${grid.length - misses.length}/${grid.length} points picked`).toBe(
      `${grid.length}/${grid.length} points picked`,
    );
    expect(misses).toEqual([]);

    // Near the right and top edges of the plot the card is whole: it lives in
    // the browser top layer, outside the svg and its plot clip.
    const nearRight = targets.reduce((a, b) => (b.x > a.x ? b : a));
    const nearTop = targets.reduce((a, b) => (b.y < a.y ? b : a));
    const tooltip = getTooltip();
    const layer = tooltip?.parentElement;
    if (!tooltip || !layer) {
      throw new Error('Point card or its Layer host did not render');
    }
    for (const target of [nearRight, nearTop]) {
      await hover(target, 'mouse');
      const card = layer.getBoundingClientRect();
      expect(svg.contains(tooltip)).toBe(false);
      expect(card.width).toBeGreaterThan(0);
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.top).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(view.innerWidth);
      expect(card.bottom).toBeLessThanOrEqual(view.innerHeight);
      // The card sits beside the dot and never covers it.
      const coversDot =
        target.x >= card.left &&
        target.x <= card.right &&
        target.y >= card.top &&
        target.y <= card.bottom;
      expect(coversDot).toBe(false);
    }

    // React derives onPointerLeave from pointerout and its relatedTarget.
    eventSurface.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: doc.body,
        pointerType: 'mouse',
      }),
    );
    await waitFor(() => {
      expect(isTooltipOpen()).toBe(false);
      expect(tooltip.textContent).toBe('');
    });
  },
};

/** GPU heatmap — a 2D grid of colored cells (traffic by hour x day). */
export const Heatmap: StoryObj = {
  render: () => (
    <Chart
      data={heatmapData}
      xKey="hour"
      title="Traffic heatmap"
      series={[
        heatmapGL({
          xKey: 'hour',
          yKey: 'day',
          valueKey: 'traffic',
          colorRange: ['#eff6ff', '#1e40af'],
        }),
      ]}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" showAxisLine />
        </>
      }
      height={280}
    />
  ),
};

const STREAM_WINDOW = 60;
const STREAM_INITIAL_COUNT = 60;
const STREAM_INTERVAL_MS = 200;

type StreamSample = {x: number; y: number};

function createStream() {
  const next = createStreamSamples();
  return {next, samples: Array.from({length: STREAM_INITIAL_COUNT}, next)};
}

function replaySamples(handle: StreamGLHandle, samples: StreamSample[]) {
  handle.clear();
  for (const sample of samples) {
    handle.push(sample.x, sample.y);
  }
}

/**
 * Streaming line via an imperative push handle + a sliding domain window. It
 * starts from the same seeded samples on every load and then streams live.
 * Pause stops the stream; Step pushes one sample while paused; Reset returns to
 * the initial samples.
 */
export const Streaming: StoryObj = {
  render: function StreamingStory() {
    const streamRef = useRef<ReturnType<typeof createStream> | null>(null);
    if (streamRef.current == null) {
      streamRef.current = createStream();
    }
    // The stream mark creates its push handle only when the plot mounts, which
    // can be after this story's first effects. Each mount has an empty ring
    // buffer, so every new handle gets the samples so far.
    const [handleRef] = useState(() => {
      let handle: StreamGLHandle | null = null;
      const ref: MutableRefObject<StreamGLHandle | null> = {
        get current() {
          return handle;
        },
        set current(next) {
          handle = next;
          if (next != null) {
            replaySamples(next, streamRef.current?.samples ?? []);
          }
        },
      };
      return ref;
    });
    const [sampleCount, setSampleCount] = useState(STREAM_INITIAL_COUNT);
    const [isPaused, setIsPaused] = useState(false);

    const pushSample = useCallback(() => {
      const stream = streamRef.current;
      if (stream == null) {
        return;
      }
      const sample = stream.next();
      stream.samples.push(sample);
      handleRef.current?.push(sample.x, sample.y);
      setSampleCount(stream.samples.length);
    }, [handleRef]);

    const reset = () => {
      const stream = createStream();
      streamRef.current = stream;
      if (handleRef.current != null) {
        replaySamples(handleRef.current, stream.samples);
      }
      setSampleCount(STREAM_INITIAL_COUNT);
    };

    useEffect(() => {
      if (isPaused) {
        return;
      }
      const interval = setInterval(pushSample, STREAM_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [isPaused, pushSample]);

    const windowEnd = Math.max(STREAM_WINDOW, sampleCount);
    return (
      <VStack gap={2}>
        <HStack gap={2}>
          <Button
            label={isPaused ? 'Resume' : 'Pause'}
            onClick={() => setIsPaused(paused => !paused)}
          />
          <Button label="Step" isDisabled={!isPaused} onClick={pushSample} />
          <Button label="Reset" onClick={reset} />
        </HStack>
        <Chart
          data={[]}
          xKey="x"
          title="Live stream (streamGL)"
          xDomain={[windowEnd - STREAM_WINDOW, windowEnd]}
          yDomain={[0, 100]}
          series={[streamGL({handleRef, color: '#3b82f6'})]}
          grid={<ChartGrid />}
          axes={axes}
          height={300}
        />
      </VStack>
    );
  },
};
