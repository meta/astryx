// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
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
 * GPU scatter with color-picking hover (`dotGLInteractive`) — hover any point
 * for a highlight + tooltip. O(1) hit detection regardless of point count.
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
