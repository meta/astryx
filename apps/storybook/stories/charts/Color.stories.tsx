// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  bar,
  line,
  ChartGrid,
  ChartAxis,
  useChartColors,
  type ChartColorsAPI,
} from '@astryxdesign/charts';
import {Stack, Text, useLocale} from '@astryxdesign/core';
import {useTheme} from '@astryxdesign/core/theme';
import {monthlyData, profitLossData} from './_data';

const meta: Meta<typeof Chart> = {
  title: 'Charts/Color',
  component: Chart,
};
export default meta;

const axes = (
  <>
    <ChartAxis position="bottom" />
    <ChartAxis position="left" />
  </>
);

/** The color API stories render fixed scenarios, so they show no controls. */
const fixedScenario = {controls: {disable: true}};

/** No colors passed — the chart assigns distinct colors from the theme palette. */
export const AutoPalette: StoryObj = {
  render: () => (
    <Chart
      data={monthlyData}
      xKey="month"
      title="Auto palette"
      subtitle="No colors passed — assigned from the theme's categorical palette"
      series={[
        bar('revenue', {group: 'g'}),
        bar('costs', {group: 'g'}),
        line('trend'),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={320}
    />
  ),
};

/** Per-datum color via an accessor; the series still shows in the legend. */
export const AccessorColor: StoryObj = {
  render: () => (
    <Chart
      data={profitLossData}
      xKey="month"
      title="Green when positive, red when negative"
      series={[
        bar('profit', {
          label: 'Profit',
          color: d =>
            (d.profit as number) >= 0
              ? 'var(--color-success)'
              : 'var(--color-error)',
        }),
      ]}
      legend
      grid={<ChartGrid />}
      axes={axes}
      height={320}
    />
  ),
};

// Synthetic data for the color API stories below.

const SIGNUPS_BY_CHANNEL = [
  {channel: 'Web', signups: 1840},
  {channel: 'Ads', signups: 1260},
  {channel: 'Email', signups: 970},
  {channel: 'Apps', signups: 640},
  {channel: 'Press', signups: 310},
];

const TICKETS_BY_RESPONSE_TIME = [
  {bucket: '<1h', tickets: 420},
  {bucket: '1–4h', tickets: 310},
  {bucket: '4–8h', tickets: 180},
  {bucket: '8–24h', tickets: 95},
  {bucket: '>24h', tickets: 40},
];

const MONTHLY_RESULT = [
  {month: 'Jan', result: 32},
  {month: 'Feb', result: 14},
  {month: 'Mar', result: 3},
  {month: 'Apr', result: -9},
  {month: 'May', result: -26},
  {month: 'Jun', result: 21},
];

const TEMPERATURE_ANOMALY = [
  {month: 'Jan', anomaly: -1.6},
  {month: 'Feb', anomaly: -1.1},
  {month: 'Mar', anomaly: -0.4},
  {month: 'Apr', anomaly: 0.1},
  {month: 'May', anomaly: 0.6},
  {month: 'Jun', anomaly: 1.2},
  {month: 'Jul', anomaly: 1.7},
  {month: 'Aug', anomaly: 1.4},
  {month: 'Sep', anomaly: 0.8},
  {month: 'Oct', anomaly: 0.2},
  {month: 'Nov', anomaly: -0.6},
  {month: 'Dec', anomaly: -1.0},
];

const SURVEY_RESPONSES = [
  {score: '−2', responses: 18},
  {score: '−1', responses: 42},
  {score: '0', responses: 65},
  {score: '+1', responses: 120},
  {score: '+2', responses: 74},
];

const HEALTH_CHECKS_BY_DAY = [
  {day: 'Mon', passing: 182, warning: 10, failing: 3, notRun: 5},
  {day: 'Tue', passing: 176, warning: 14, failing: 6, notRun: 4},
  {day: 'Wed', passing: 188, warning: 8, failing: 2, notRun: 2},
  {day: 'Thu', passing: 160, warning: 22, failing: 12, notRun: 6},
  {day: 'Fri', passing: 179, warning: 12, failing: 5, notRun: 4},
  {day: 'Sat', passing: 90, warning: 4, failing: 1, notRun: 105},
  {day: 'Sun', passing: 92, warning: 3, failing: 1, notRun: 104},
];

const REQUESTS_BY_HOUR = [
  220, 180, 150, 130, 140, 190, 320, 540, 780, 910, 960, 990, 1010, 980, 950,
  920, 880, 820, 700, 560, 450, 380, 310, 260,
];

/**
 * `useChartColors().categorical(n)` returns `n` colors from the theme's
 * categorical palette, in slot order. Past the last slot it starts again from
 * the first. This story gives each of five channels its own color through a
 * bar color accessor.
 */
export const Categorical: StoryObj = {
  name: 'Categorical',
  parameters: fixedScenario,
  render: function CategoricalStory() {
    const palette = useChartColors().categorical(SIGNUPS_BY_CHANNEL.length);
    return (
      <Chart
        data={SIGNUPS_BY_CHANNEL}
        xKey="channel"
        title="New signups by channel"
        subtitle="Signups, last 30 days · colors: categorical(5)"
        series={[
          bar('signups', {label: 'Signups', color: (_, i) => palette[i]}),
        ]}
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/**
 * `useChartColors().sequential.<hue>(n)` returns `n` ordered stops of one
 * hue's ramp, from step 5 to step 1. When `n` is 5 or less, every color is a
 * token stop. The available hues are blue, shamrock, orange, pink, purple, red,
 * teal, yellow and gray. This story colors five ordered response-time buckets
 * with `sequential.blue(5)`.
 */
export const Sequential: StoryObj = {
  name: 'Sequential',
  parameters: fixedScenario,
  render: function SequentialStory() {
    const ramp = useChartColors().sequential.blue(
      TICKETS_BY_RESPONSE_TIME.length,
    );
    return (
      <Chart
        data={TICKETS_BY_RESPONSE_TIME}
        xKey="bucket"
        title="Support tickets by first-response time"
        subtitle="Tickets, last 30 days · colors: sequential.blue(5)"
        series={[bar('tickets', {label: 'Tickets', color: (_, i) => ramp[i]})]}
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/** Index into a five-color diverging scale, for a result in thousands. */
function resultBin(result: number): number {
  if (Math.abs(result) < 5) {
    return 2;
  }
  if (result >= 20) {
    return 0;
  }
  if (result > 0) {
    return 1;
  }
  return result <= -20 ? 4 : 3;
}

/**
 * `useChartColors().diverging.positiveNegative(n)` returns shamrock stops, a
 * gray midpoint (`--color-data-gray-1`) when `n` is odd, then red stops. This
 * story puts each month's result in one of five bins: 20 or more; 5 to less
 * than 20; more than −5 and less than 5; more than −20 to −5; −20 or less.
 */
export const DivergingPositiveNegative: StoryObj = {
  name: 'Diverging: positive/negative',
  parameters: fixedScenario,
  render: function DivergingPositiveNegativeStory() {
    const scale = useChartColors().diverging.positiveNegative(5);
    return (
      <Chart
        data={MONTHLY_RESULT}
        xKey="month"
        title="Monthly profit and loss"
        subtitle="Net result, thousands · colors: diverging.positiveNegative(5)"
        series={[
          bar('result', {
            label: 'Result',
            color: d => scale[resultBin(d.result as number)],
          }),
        ]}
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/**
 * `useChartColors().diverging.coldHot(n)` returns blue stops, a gray midpoint
 * (`--color-data-gray-1`) when `n` is odd, then red stops. This story puts
 * each month's anomaly in one of seven 0.5 °C bins centered on zero.
 */
export const DivergingColdHot: StoryObj = {
  name: 'Diverging: cold/hot',
  parameters: fixedScenario,
  render: function DivergingColdHotStory() {
    const scale = useChartColors().diverging.coldHot(7);
    const bin = (anomaly: number) =>
      Math.min(6, Math.max(0, Math.round(anomaly / 0.5) + 3));
    return (
      <Chart
        data={TEMPERATURE_ANOMALY}
        xKey="month"
        title="Monthly temperature anomaly"
        subtitle="°C against the 30-year average · colors: diverging.coldHot(7)"
        series={[
          bar('anomaly', {
            label: 'Anomaly',
            color: d => scale[bin(d.anomaly as number)],
          }),
        ]}
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/**
 * `useChartColors().diverging.custom(neg, pos, n, midpoint?)` builds a
 * diverging scale from any two sequential hues. The optional fourth argument
 * replaces the default midpoint (`--color-data-gray-1`). This story uses
 * purple and teal, with `semantic.neutral` as the midpoint, for the five
 * answers on one agreement scale.
 */
export const DivergingCustom: StoryObj = {
  name: 'Diverging: custom',
  parameters: fixedScenario,
  render: function DivergingCustomStory() {
    const colors = useChartColors();
    const scale = colors.diverging.custom(
      'purple',
      'teal',
      SURVEY_RESPONSES.length,
      colors.semantic.neutral,
    );
    return (
      <Chart
        data={SURVEY_RESPONSES}
        xKey="score"
        title="“The release notes are clear”"
        subtitle="Responses from 319 people, from −2 (strongly disagree) to +2 (strongly agree) · colors: diverging.custom('purple', 'teal', 5, semantic.neutral)"
        series={[
          bar('responses', {label: 'Responses', color: (_, i) => scale[i]}),
        ]}
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/**
 * `useChartColors().semantic` returns four single colors: `positive`,
 * `negative`, `warning` and `neutral`. This story gives each of four check
 * outcomes one of them, in a stacked bar series with a legend.
 */
export const Semantic: StoryObj = {
  name: 'Semantic',
  parameters: fixedScenario,
  render: function SemanticStory() {
    const {semantic} = useChartColors();
    return (
      <Chart
        data={HEALTH_CHECKS_BY_DAY}
        xKey="day"
        title="Health checks by outcome"
        subtitle="Checks per day, last week · colors: semantic"
        series={[
          bar('passing', {
            label: 'Passing',
            stack: 'outcome',
            color: semantic.positive,
          }),
          bar('warning', {
            label: 'Warning',
            stack: 'outcome',
            color: semantic.warning,
          }),
          bar('failing', {
            label: 'Failing',
            stack: 'outcome',
            color: semantic.negative,
          }),
          bar('notRun', {
            label: 'Not run',
            stack: 'outcome',
            color: semantic.neutral,
          }),
        ]}
        legend={{position: 'bottom', alignment: 'center'}}
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

const canvasStyles = stylex.create({
  canvas: {
    display: 'block',
    height: 180,
    maxWidth: 560,
    width: '100%',
  },
});

const PLOT_INSET = {top: 8, end: 8, bottom: 28, start: 44};
const GRID_VALUES = [300, 600, 900, 1200];
const REQUESTS_MAX = 1200;

function drawRequestRate(
  canvas: HTMLCanvasElement,
  colors: ChartColorsAPI,
  font: string,
  locale: string,
) {
  const context = canvas.getContext('2d');
  if (context == null) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const plotWidth = width - PLOT_INSET.start - PLOT_INSET.end;
  const plotHeight = height - PLOT_INSET.top - PLOT_INSET.bottom;
  const baseline = PLOT_INSET.top + plotHeight;
  const xAt = (hour: number) =>
    Math.round(PLOT_INSET.start + (plotWidth * hour) / 23);
  const yAt = (value: number) =>
    PLOT_INSET.top + plotHeight * (1 - value / REQUESTS_MAX);

  // Lines are 1px filled rectangles on whole pixels, so they paint the exact
  // color with no anti-aliasing.
  context.fillStyle = colors.structural.grid;
  for (const value of GRID_VALUES) {
    context.fillRect(PLOT_INSET.start, Math.round(yAt(value)), plotWidth, 1);
  }
  context.fillStyle = colors.structural.axis;
  context.fillRect(PLOT_INSET.start, baseline, plotWidth, 1);
  context.font = font;
  context.fillStyle = colors.structural.label;
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (const value of [0, ...GRID_VALUES]) {
    context.fillText(
      new Intl.NumberFormat(locale).format(value),
      PLOT_INSET.start - 8,
      Math.round(yAt(value)),
    );
  }
  context.textBaseline = 'top';
  for (const hour of [0, 6, 12, 18]) {
    context.fillStyle = colors.structural.tick;
    context.fillRect(xAt(hour), baseline + 1, 1, 5);
    context.fillStyle = colors.structural.label;
    context.textAlign = hour === 0 ? 'left' : 'center';
    context.fillText(
      `${String(hour).padStart(2, '0')}:00`,
      xAt(hour),
      baseline + 9,
    );
  }

  context.strokeStyle = colors.categorical(1)[0];
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.beginPath();
  REQUESTS_BY_HOUR.forEach((value, hour) => {
    if (hour === 0) {
      context.moveTo(xAt(hour), yAt(value));
    } else {
      context.lineTo(xAt(hour), yAt(value));
    }
  });
  context.stroke();
}

function RequestRateCanvas() {
  const colors = useChartColors();
  const {token} = useTheme();
  const font = `${token('--text-supporting-size')} ${token('--font-family-body')}`;
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Synchronize the canvas 2D bitmap with its size and the resolved colors.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) {
      return;
    }
    const draw = () => drawRequestRate(canvas, colors, font, locale);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [colors, font, locale]);

  return (
    <canvas
      {...stylex.props(canvasStyles.canvas)}
      ref={canvasRef}
      role="img"
      aria-label="Requests per hour over one day. The rate is lowest at 03:00, with 130 requests, and highest at 12:00, with 1,010 requests."
    />
  );
}

/**
 * `useChartColors().structural` returns four concrete chrome colors: `axis`,
 * `grid`, `tick` and `label`. The values are plain color strings, so a 2D
 * canvas can use them. This story draws a request-rate line on a canvas, with
 * its grid lines, baseline, ticks and labels in the structural colors.
 */
export const Structural: StoryObj = {
  name: 'Structural',
  parameters: fixedScenario,
  render: () => (
    <Stack direction="vertical" gap={2}>
      <Stack direction="vertical" gap={0}>
        <Text type="body" weight="semibold" display="block">
          Requests per hour
        </Text>
        <Text type="supporting" display="block">
          Requests, one day · chrome colors: structural
        </Text>
      </Stack>
      <RequestRateCanvas />
    </Stack>
  ),
};
