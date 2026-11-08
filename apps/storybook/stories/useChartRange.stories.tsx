// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useEffect, useRef, type RefObject} from 'react';
import {
  Chart,
  ChartAxis,
  ChartGrid,
  ChartStreamGL,
  useChartColors,
  useChartRange,
  type ChartStreamGLHandle,
} from '@astryxdesign/lab';
import {Stack, Text} from '@astryxdesign/core';
import {Heading} from '@astryxdesign/core/Text';

const meta: Meta = {
  title: 'Lab/Hooks/useChartRange',
};

export default meta;

const FRAME_MS = 33;
const CAPTURE_OVERRUN = 60;
const KNOWN_Y_DOMAIN: [number, number] = [0, 100];

type Sample = readonly [x: number, y: number];
type SampleFactory = () => () => Sample;
type PushSample = ReturnType<typeof useChartRange>['push'];
type ResetRange = ReturnType<typeof useChartRange>['reset'];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const createKnownRangeSamples: SampleFactory = () => {
  const random = createRandom(0x4b1d);
  let t = 0;
  return () => {
    t += 1;
    return [t, Math.sin(t * 0.04) * 30 + 50 + (random() - 0.5) * 10];
  };
};

const createUnknownRangeSamples: SampleFactory = () => {
  let t = 0;
  return () => {
    t += 1;
    const amplitude = 10 + t * 0.05;
    return [t, Math.sin(t * 0.03) * amplitude + 50];
  };
};

const createZeroCenteredSamples: SampleFactory = () => {
  const random = createRandom(0x7e10);
  let t = 0;
  let quake = 0;
  return () => {
    t += 1;
    if (random() < 0.003) {
      quake = 30 + random() * 50;
    }
    quake *= 0.97;
    const tremor = (random() - 0.5) * 2;
    const displacement =
      quake > 0.5 ? Math.sin(t * 0.5) * quake * (0.5 + random() * 0.5) : 0;
    return [t, tremor + displacement];
  };
};

function useStoryStream({
  streamRef,
  push,
  reset,
  createSamples,
  captureSampleCount,
  redrawKey,
  useAnimationFrame = false,
}: {
  streamRef: RefObject<ChartStreamGLHandle | null>;
  push: PushSample;
  reset: ResetRange;
  createSamples: SampleFactory;
  captureSampleCount: number;
  redrawKey: string;
  useAnimationFrame?: boolean;
}) {
  useEffect(() => {
    reset();
    streamRef.current?.clear();
    const nextSample = createSamples();
    const emit = () => {
      const sample = nextSample();
      push(sample[0], sample[1], streamRef);
      return sample;
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let lastSample: Sample = [0, 0];
      for (let index = 0; index < captureSampleCount; index += 1) {
        lastSample = emit();
      }
      const redraw = window.setTimeout(() => {
        streamRef.current?.push(lastSample[0], lastSample[1]);
      }, 0);
      return () => window.clearTimeout(redraw);
    }

    if (useAnimationFrame) {
      let frame: number;
      const tick = () => {
        emit();
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frame);
    }

    const interval = window.setInterval(emit, FRAME_MS);
    return () => window.clearInterval(interval);
  }, [
    captureSampleCount,
    createSamples,
    push,
    redrawKey,
    reset,
    streamRef,
    useAnimationFrame,
  ]);
}

/** Known y-range — useChartRange just manages the sliding x window */
export const KnownRange: StoryObj = {
  render: () => {
    const colors = useChartColors();
    const color = colors.categorical(1)[0];
    const streamRef = useRef<ChartStreamGLHandle>(null);
    const {xDomain, yDomain, push, reset} = useChartRange({
      xWindow: 300,
      yDomain: KNOWN_Y_DOMAIN,
    });

    useStoryStream({
      streamRef,
      push,
      reset,
      createSamples: createKnownRangeSamples,
      captureSampleCount: 300 + CAPTURE_OVERRUN,
      redrawKey: color,
    });

    return (
      <Stack direction="vertical" gap={4}>
        <Heading level={3}>Known Range (0-100%)</Heading>
        <Text type="supporting" color="secondary">
          yDomain fixed at [0, 100]. useChartRange manages xDomain sliding
          window.
        </Text>
        <Chart
          data={[]}
          xKey="t"
          yKeys={[]}
          xDomain={xDomain}
          yDomain={yDomain}
          height={200}>
          <ChartGrid horizontal />
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
          <ChartStreamGL
            handleRef={streamRef}
            color={color}
            bufferSize={300}
            lineWidth={1.5}
          />
        </Chart>
      </Stack>
    );
  },
};

/** Unknown y-range — auto-tracks from data with 10% padding */
export const UnknownRange: StoryObj = {
  render: () => {
    const colors = useChartColors();
    const color = colors.categorical(2)[1];
    const streamRef = useRef<ChartStreamGLHandle>(null);
    const {xDomain, yDomain, push, reset} = useChartRange({
      xWindow: 300,
      yPadding: 0.1,
    });

    useStoryStream({
      streamRef,
      push,
      reset,
      createSamples: createUnknownRangeSamples,
      captureSampleCount: 300 + CAPTURE_OVERRUN,
      redrawKey: color,
    });

    return (
      <Stack direction="vertical" gap={4}>
        <Heading level={3}>Unknown Range (auto-tracks)</Heading>
        <Text type="supporting" color="secondary">
          No fixed yDomain. Range auto-expands as data reveals amplitude.
          Currently: [{yDomain[0].toFixed(1)}, {yDomain[1].toFixed(1)}]
        </Text>
        <Chart
          data={[]}
          xKey="t"
          yKeys={[]}
          xDomain={xDomain}
          yDomain={yDomain}
          height={200}>
          <ChartGrid horizontal />
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
          <ChartStreamGL
            handleRef={streamRef}
            color={color}
            bufferSize={300}
            lineWidth={1.5}
          />
        </Chart>
      </Stack>
    );
  },
};

/** Zero-centered — seismograph pattern with yCenter */
export const ZeroCentered: StoryObj = {
  render: () => {
    const colors = useChartColors();
    const color = colors.categorical(5)[3];
    const streamRef = useRef<ChartStreamGLHandle>(null);
    const {xDomain, yDomain, push, reset} = useChartRange({
      xWindow: 600,
      yCenter: true,
      yPadding: 0.05,
    });

    useStoryStream({
      streamRef,
      push,
      reset,
      createSamples: createZeroCenteredSamples,
      captureSampleCount: 600 + CAPTURE_OVERRUN,
      redrawKey: color,
      useAnimationFrame: true,
    });

    return (
      <Stack direction="vertical" gap={4}>
        <Heading level={3}>Zero-Centered (seismograph)</Heading>
        <Text type="supporting" color="secondary">
          yCenter=true keeps 0 at center. Range auto-expands on quake bursts.
          Currently: [{yDomain[0].toFixed(1)}, {yDomain[1].toFixed(1)}]
        </Text>
        <Chart
          data={[]}
          xKey="t"
          yKeys={[]}
          xDomain={xDomain}
          yDomain={yDomain}
          yBaseline="zero"
          height={220}>
          <ChartGrid horizontal />
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
          <ChartStreamGL
            handleRef={streamRef}
            color={color}
            bufferSize={600}
            lineWidth={1}
            opacity={0.9}
          />
        </Chart>
      </Stack>
    );
  },
};
