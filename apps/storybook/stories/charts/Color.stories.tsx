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
import {monthlyData} from './_data';

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

const REVENUE_WITH_PROJECTION = [
  {month: 'Apr', revenue: 182, projected: false},
  {month: 'May', revenue: 191, projected: false},
  {month: 'Jun', revenue: 204, projected: false},
  {month: 'Jul*', revenue: 212, projected: true},
  {month: 'Aug*', revenue: 219, projected: true},
  {month: 'Sep*', revenue: 227, projected: true},
];

/**
 * A function `color` accessor gives each bar its own color from its datum.
 * Here per-datum color encodes a property of each value: actual months use
 * the series color, and projected months use `semantic.neutral`. Use one
 * color per series for series identity. The projected status is also text:
 * projected months end in "*" in the axis, tooltip and data table, and the
 * legend lists "Actual" and "Projected (*)". Check that every projected bar is
 * gray and every actual bar is the series color.
 */
export const AccessorColor: StoryObj = {
  parameters: fixedScenario,
  render: function AccessorColorStory() {
    const colors = useChartColors();
    const [actualColor] = colors.categorical(1);
    const projectedColor = colors.semantic.neutral;
    return (
      <Chart
        data={REVENUE_WITH_PROJECTION}
        xKey="month"
        title="Monthly revenue, actual and projected"
        subtitle="Thousands · months marked * are projected"
        series={[
          bar('revenue', {
            label: 'Revenue',
            color: d => (d.projected ? projectedColor : actualColor),
          }),
        ]}
        legend={{
          items: [
            {label: 'Actual', color: actualColor, type: 'bar'},
            {label: 'Projected (*)', color: projectedColor, type: 'bar'},
          ],
        }}
        tooltip
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

// Synthetic data for the color API stories below.

const ACTIVE_USERS_BY_REGION = [
  {
    month: 'Jan',
    northAmerica: 412,
    europe: 356,
    asiaPacific: 248,
    latinAmerica: 118,
    middleEastAfrica: 62,
  },
  {
    month: 'Feb',
    northAmerica: 418,
    europe: 361,
    asiaPacific: 262,
    latinAmerica: 124,
    middleEastAfrica: 66,
  },
  {
    month: 'Mar',
    northAmerica: 425,
    europe: 368,
    asiaPacific: 279,
    latinAmerica: 129,
    middleEastAfrica: 71,
  },
  {
    month: 'Apr',
    northAmerica: 431,
    europe: 372,
    asiaPacific: 297,
    latinAmerica: 137,
    middleEastAfrica: 75,
  },
  {
    month: 'May',
    northAmerica: 440,
    europe: 381,
    asiaPacific: 318,
    latinAmerica: 144,
    middleEastAfrica: 81,
  },
  {
    month: 'Jun',
    northAmerica: 452,
    europe: 390,
    asiaPacific: 341,
    latinAmerica: 152,
    middleEastAfrica: 88,
  },
];

const REGIONS = [
  {key: 'northAmerica', label: 'North America'},
  {key: 'europe', label: 'Europe'},
  {key: 'asiaPacific', label: 'Asia Pacific'},
  {key: 'latinAmerica', label: 'Latin America'},
  {key: 'middleEastAfrica', label: 'Middle East & Africa'},
];

const TICKETS_BY_WEEK = [
  {week: 'W1', under1h: 410, h1to4: 300, h4to8: 170, h8to24: 90, over24h: 35},
  {week: 'W2', under1h: 395, h1to4: 312, h4to8: 182, h8to24: 96, over24h: 41},
  {week: 'W3', under1h: 430, h1to4: 288, h4to8: 160, h8to24: 84, over24h: 30},
  {week: 'W4', under1h: 452, h1to4: 276, h4to8: 151, h8to24: 77, over24h: 26},
  {week: 'W5', under1h: 418, h1to4: 305, h4to8: 174, h8to24: 92, over24h: 38},
  {week: 'W6', under1h: 440, h1to4: 290, h4to8: 158, h8to24: 80, over24h: 29},
];

const RESPONSE_TIME_BUCKETS = [
  {key: 'under1h', label: 'Under 1 h'},
  {key: 'h1to4', label: '1–4 h'},
  {key: 'h4to8', label: '4–8 h'},
  {key: 'h8to24', label: '8–24 h'},
  {key: 'over24h', label: 'Over 24 h'},
];

const MRR_MOVEMENTS = [
  {month: 'Jan', new: 42, expansion: 18, contraction: -9, churn: -14},
  {month: 'Feb', new: 38, expansion: 21, contraction: -11, churn: -17},
  {month: 'Mar', new: 45, expansion: 19, contraction: -8, churn: -12},
  {month: 'Apr', new: 51, expansion: 24, contraction: -12, churn: -19},
  {month: 'May', new: 47, expansion: 26, contraction: -10, churn: -15},
  {month: 'Jun', new: 55, expansion: 23, contraction: -9, churn: -13},
];

const COMFORT_BY_WING = [
  {
    wing: 'North',
    muchTooCold: 18,
    tooCold: 26,
    aboutRight: 38,
    tooWarm: 12,
    muchTooWarm: 6,
  },
  {
    wing: 'South',
    muchTooCold: 4,
    tooCold: 9,
    aboutRight: 37,
    tooWarm: 31,
    muchTooWarm: 19,
  },
  {
    wing: 'East',
    muchTooCold: 8,
    tooCold: 17,
    aboutRight: 49,
    tooWarm: 18,
    muchTooWarm: 8,
  },
  {
    wing: 'West',
    muchTooCold: 6,
    tooCold: 12,
    aboutRight: 40,
    tooWarm: 27,
    muchTooWarm: 15,
  },
  {
    wing: 'Annex',
    muchTooCold: 22,
    tooCold: 30,
    aboutRight: 33,
    tooWarm: 10,
    muchTooWarm: 5,
  },
];

const COMFORT_ANSWERS = [
  {key: 'muchTooCold', label: 'Much too cold'},
  {key: 'tooCold', label: 'Too cold'},
  {key: 'aboutRight', label: 'About right'},
  {key: 'tooWarm', label: 'Too warm'},
  {key: 'muchTooWarm', label: 'Much too warm'},
];

const AGREEMENT_BY_TEAM = [
  {
    team: 'Eng',
    stronglyDisagree: 4,
    disagree: 9,
    neutral: 17,
    agree: 41,
    stronglyAgree: 29,
  },
  {
    team: 'Ops',
    stronglyDisagree: 8,
    disagree: 15,
    neutral: 22,
    agree: 35,
    stronglyAgree: 20,
  },
  {
    team: 'Sales',
    stronglyDisagree: 15,
    disagree: 24,
    neutral: 26,
    agree: 25,
    stronglyAgree: 10,
  },
  {
    team: 'Legal',
    stronglyDisagree: 12,
    disagree: 21,
    neutral: 30,
    agree: 27,
    stronglyAgree: 10,
  },
  {
    team: 'HR',
    stronglyDisagree: 6,
    disagree: 14,
    neutral: 28,
    agree: 34,
    stronglyAgree: 18,
  },
];

const AGREEMENT_ANSWERS = [
  {key: 'stronglyDisagree', label: 'Strongly disagree'},
  {key: 'disagree', label: 'Disagree'},
  {key: 'neutral', label: 'Neutral'},
  {key: 'agree', label: 'Agree'},
  {key: 'stronglyAgree', label: 'Strongly agree'},
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
 * the first. Each color is one series: this story draws five regions as five
 * lines, with one palette color each.
 */
export const Categorical: StoryObj = {
  name: 'Categorical',
  parameters: fixedScenario,
  render: function CategoricalStory() {
    const palette = useChartColors().categorical(REGIONS.length);
    return (
      <Chart
        data={ACTIVE_USERS_BY_REGION}
        xKey="month"
        title="Monthly active users by region"
        subtitle="Thousands of users, January to June · colors: categorical(5)"
        series={REGIONS.map(({key, label}, i) =>
          line(key, {label, color: palette[i], dots: true}),
        )}
        legend
        tooltip
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
 * teal, yellow and gray. Each color is one series: five ordered response-time
 * buckets stack in each week's bar, from step 5 (under 1 h) to step 1 (over
 * 24 h). The ramps are the same in light and dark mode. Step 1 is close to a
 * light background, and step 5 is close to a dark background.
 */
export const Sequential: StoryObj = {
  name: 'Sequential',
  parameters: fixedScenario,
  render: function SequentialStory() {
    const ramp = useChartColors().sequential.blue(RESPONSE_TIME_BUCKETS.length);
    return (
      <Chart
        data={TICKETS_BY_WEEK}
        xKey="week"
        title="Support tickets by first-response time"
        subtitle="Tickets per week · colors: sequential.blue(5)"
        series={RESPONSE_TIME_BUCKETS.map(({key, label}, i) =>
          bar(key, {label, stack: 'tickets', color: ramp[i]}),
        )}
        legend
        tooltip
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/**
 * `useChartColors().diverging.positiveNegative(n)` returns shamrock stops, a
 * gray midpoint (`--color-data-gray-1`) when `n` is odd, then red stops. With
 * `n` = 4 there is no midpoint. Each color is one series: two positive and two
 * negative revenue movements. The positive series share one stack, and the
 * negative series share another, each ordered from 0 outward. Neither stack has
 * a `group`, so in current behavior both draw in the same column and each
 * grows from 0. One stack with mixed signs does not diverge, because stacking
 * is cumulative.
 */
export const DivergingPositiveNegative: StoryObj = {
  name: 'Diverging: positive/negative',
  parameters: fixedScenario,
  render: function DivergingPositiveNegativeStory() {
    const [newColor, expansionColor, contractionColor, churnColor] =
      useChartColors().diverging.positiveNegative(4);
    return (
      <Chart
        data={MRR_MOVEMENTS}
        xKey="month"
        title="Monthly recurring revenue movements"
        subtitle="Change in MRR, thousands · colors: diverging.positiveNegative(4)"
        series={[
          bar('expansion', {
            label: 'Expansion',
            stack: 'gains',
            color: expansionColor,
          }),
          bar('new', {label: 'New', stack: 'gains', color: newColor}),
          bar('contraction', {
            label: 'Contraction',
            stack: 'losses',
            color: contractionColor,
          }),
          bar('churn', {label: 'Churn', stack: 'losses', color: churnColor}),
        ]}
        legend
        tooltip
        grid={<ChartGrid />}
        axes={axes}
        height={320}
      />
    );
  },
};

/**
 * `useChartColors().diverging.coldHot(n)` returns blue stops, a gray midpoint
 * (`--color-data-gray-1`) when `n` is odd, then red stops. Each color is one
 * series: the five answers stack in scale order, from "Much too cold" at the
 * bottom to "Much too warm" at the top, with the midpoint in the middle. The
 * ramps are the same in light and dark mode. The gray midpoint and the step-1
 * stops are close to a light background, and blue step 5 is close to a dark
 * background.
 */
export const DivergingColdHot: StoryObj = {
  name: 'Diverging: cold/hot',
  parameters: fixedScenario,
  render: function DivergingColdHotStory() {
    const scale = useChartColors().diverging.coldHot(COMFORT_ANSWERS.length);
    return (
      <Chart
        data={COMFORT_BY_WING}
        xKey="wing"
        title="Office temperature survey by building wing"
        subtitle="% of responses · colors: diverging.coldHot(5)"
        series={COMFORT_ANSWERS.map(({key, label}, i) =>
          bar(key, {label, stack: 'answers', color: scale[i]}),
        )}
        legend
        tooltip
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
 * replaces the default midpoint (`--color-data-gray-1`). Each color is one
 * series: this story uses purple and teal, with `semantic.neutral` as the
 * midpoint, for five answers that stack in scale order. The ramps are the same
 * in light and dark mode. The step-1 stops are close to a light background,
 * and purple step 5 is close to a dark background.
 */
export const DivergingCustom: StoryObj = {
  name: 'Diverging: custom',
  parameters: fixedScenario,
  render: function DivergingCustomStory() {
    const colors = useChartColors();
    const scale = colors.diverging.custom(
      'purple',
      'teal',
      AGREEMENT_ANSWERS.length,
      colors.semantic.neutral,
    );
    return (
      <Chart
        data={AGREEMENT_BY_TEAM}
        xKey="team"
        title="“The release notes are clear”"
        subtitle="% of responses by team · colors: diverging.custom('purple', 'teal', 5, semantic.neutral)"
        series={AGREEMENT_ANSWERS.map(({key, label}, i) =>
          bar(key, {label, stack: 'answers', color: scale[i]}),
        )}
        legend
        tooltip
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
