// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {
  Chart,
  ChartAxis,
  ChartGrid,
  area,
  band,
  bar,
  compactNumber,
  dot,
  line,
  referenceLine,
  useChartColors,
  type LegendAlignment,
  type SeriesDef,
  type YBaseline,
} from '@astryxdesign/charts';
import {Grid, VStack, useLocale} from '@astryxdesign/core';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {
  latencyByConcurrencyData,
  monthlyData,
  monthlyRevenueData,
  subscriberGrowthData,
  visitsByDeviceData,
} from './_data';

const largeData = Array.from({length: 51}, (_, index) => ({
  month: `Period ${index + 1}`,
  revenue: 40 + (index % 8) * 6,
  trend: 42 + index * 0.75,
}));

type DataState = 'default' | 'empty' | 'large';
type TitleState = 'default' | 'none' | 'long';
type LegendPosition = 'off' | 'top' | 'bottom' | 'start' | 'end';
type MarkType = 'bar' | 'line' | 'area' | 'dot';
type SeriesLayout = 'grouped' | 'stacked';
type Curve = 'linear' | 'monotone' | 'natural' | 'step';

interface ChartStoryArgs {
  dataState: DataState;
  titleState: TitleState;
  revenueMark: MarkType;
  trendMark: MarkType;
  seriesLayout: SeriesLayout;
  curve: Curve;
  lineDots: boolean;
  hasTooltip: boolean;
  hoverIndicator: boolean;
  showHoverDots: boolean;
  targetLine: boolean;
  targetRange: boolean;
  trendBand: boolean;
  horizontalGrid: boolean;
  verticalGrid: boolean;
  bottomAxisLine: boolean;
  leftAxisLine: boolean;
  showTicks: boolean;
  yBaseline: YBaseline;
  fixedYDomain: boolean;
  yDomainMin: number;
  yDomainMax: number;
  legendPosition: LegendPosition;
  legendAlignment: LegendAlignment;
  height: number;
}

const MARK_OPTIONS: MarkType[] = ['bar', 'line', 'area', 'dot'];

/**
 * `Chart` draws one or more series on a shared x and y scale. Playground has
 * controls for the marks, tooltip, annotations, grid, axes, y range and
 * legend. Each other story shows one fixed chart state. For missing values (a
 * gap in a line), see the Missing Data story on the Charts/Marks/Line page.
 */
const meta: Meta<ChartStoryArgs> = {
  title: 'Charts/Chart',
  tags: ['autodocs'],
  argTypes: {
    dataState: {
      control: 'inline-radio',
      options: ['default', 'empty', 'large'],
      description: 'Six months, no rows, or 51 periods.',
      table: {category: 'Data'},
    },
    titleState: {
      control: 'inline-radio',
      options: ['default', 'none', 'long'],
      description: 'Short title, no title, or a long title with a subtitle.',
      table: {category: 'Data'},
    },
    revenueMark: {
      control: 'inline-radio',
      options: MARK_OPTIONS,
      description: 'Mark for the Revenue series.',
      table: {category: 'Marks'},
    },
    trendMark: {
      control: 'inline-radio',
      options: MARK_OPTIONS,
      description: 'Mark for the Trend series.',
      table: {category: 'Marks'},
    },
    seriesLayout: {
      control: 'inline-radio',
      options: ['grouped', 'stacked'],
      description:
        'Groups or stacks the two series. It has an effect only when both series use bars or both use areas.',
      table: {category: 'Marks'},
    },
    curve: {
      control: 'select',
      options: ['linear', 'monotone', 'natural', 'step'],
      description: 'Curve of line and area series.',
      table: {category: 'Marks'},
    },
    lineDots: {
      control: 'boolean',
      description: 'Draws a dot at each point of a line series.',
      table: {category: 'Marks'},
    },
    hasTooltip: {
      control: 'boolean',
      description: 'Shows the grouped tooltip on hover.',
      table: {category: 'Tooltip'},
    },
    hoverIndicator: {
      control: 'boolean',
      description:
        'Draws the hover indicator: a band highlight when bars are present, otherwise a vertical line.',
      if: {arg: 'hasTooltip'},
      table: {category: 'Tooltip'},
    },
    showHoverDots: {
      control: 'boolean',
      description: 'Draws a dot on each non-bar series at the hovered x.',
      if: {arg: 'hasTooltip'},
      table: {category: 'Tooltip'},
    },
    targetLine: {
      control: 'boolean',
      description: 'Adds a reference line labelled "Target" at y = 60.',
      table: {category: 'Annotations'},
    },
    targetRange: {
      control: 'boolean',
      description:
        'Adds a reference range labelled "Acceptable" from y = 40 to 50.',
      table: {category: 'Annotations'},
    },
    trendBand: {
      control: 'boolean',
      description: 'Adds a band from Trend − 6 to Trend + 6.',
      table: {category: 'Annotations'},
    },
    horizontalGrid: {
      control: 'boolean',
      description: 'Horizontal grid lines.',
      table: {category: 'Grid and axes'},
    },
    verticalGrid: {
      control: 'boolean',
      description: 'Vertical grid lines.',
      table: {category: 'Grid and axes'},
    },
    bottomAxisLine: {
      control: 'boolean',
      description: 'Edge line of the bottom axis.',
      table: {category: 'Grid and axes'},
    },
    leftAxisLine: {
      control: 'boolean',
      description: 'Edge line of the left axis.',
      table: {category: 'Grid and axes'},
    },
    showTicks: {
      control: 'boolean',
      description:
        'Tick marks on both axes. An axis with tick marks always draws its edge line.',
      table: {category: 'Grid and axes'},
    },
    yBaseline: {
      control: 'inline-radio',
      options: ['auto', 'zero', 'data'],
      description:
        'How the y domain fits the data: auto (zero for bars and areas, headroom otherwise), zero (symmetric around zero) or data (tight). A fixed domain overrides it.',
      table: {category: 'Y scale'},
    },
    fixedYDomain: {
      control: 'boolean',
      description: 'Uses the min and max below as the y domain.',
      table: {category: 'Y scale'},
    },
    yDomainMin: {
      control: 'number',
      if: {arg: 'fixedYDomain'},
      table: {category: 'Y scale'},
    },
    yDomainMax: {
      control: 'number',
      if: {arg: 'fixedYDomain'},
      table: {category: 'Y scale'},
    },
    legendPosition: {
      control: 'inline-radio',
      options: ['off', 'top', 'bottom', 'start', 'end'],
      table: {category: 'Legend'},
    },
    legendAlignment: {
      control: 'inline-radio',
      options: ['start', 'center', 'end'],
      if: {arg: 'legendPosition', neq: 'off'},
      table: {category: 'Legend'},
    },
    height: {
      control: {type: 'range', min: 160, max: 480, step: 20},
      table: {category: 'Layout'},
    },
  },
  args: {
    dataState: 'default',
    titleState: 'default',
    revenueMark: 'bar',
    trendMark: 'line',
    seriesLayout: 'grouped',
    curve: 'linear',
    lineDots: false,
    hasTooltip: true,
    hoverIndicator: true,
    showHoverDots: true,
    targetLine: false,
    targetRange: false,
    trendBand: false,
    horizontalGrid: true,
    verticalGrid: false,
    bottomAxisLine: true,
    leftAxisLine: false,
    showTicks: false,
    yBaseline: 'auto',
    fixedYDomain: false,
    yDomainMin: 0,
    yDomainMax: 100,
    legendPosition: 'bottom',
    legendAlignment: 'start',
    height: 300,
  },
};

export default meta;

type Story = StoryObj<ChartStoryArgs>;

function playgroundSeries(
  dataKey: string,
  label: string,
  mark: MarkType,
  color: string,
  {seriesLayout, curve, lineDots}: ChartStoryArgs,
): SeriesDef {
  const stacked = seriesLayout === 'stacked';
  switch (mark) {
    case 'bar':
      return bar(
        dataKey,
        stacked
          ? {color, stack: 'bars', label}
          : {color, group: 'comparison', label},
      );
    case 'line':
      return line(dataKey, {color, curve, dots: lineDots, label});
    case 'area':
      return area(dataKey, {
        color,
        curve,
        label,
        stack: stacked ? 'areas' : undefined,
      });
    case 'dot':
      return dot(dataKey, {color, label});
  }
}

function PlaygroundChart(args: ChartStoryArgs) {
  // Each series keeps its palette color when the draw order changes.
  const [revenueColor, trendColor] = useChartColors().categorical(2);
  const {
    dataState,
    titleState,
    legendPosition,
    legendAlignment,
    hasTooltip,
    hoverIndicator,
    showHoverDots,
    height,
  } = args;
  const rows =
    dataState === 'empty'
      ? []
      : dataState === 'large'
        ? largeData
        : monthlyData;
  const data = args.trendBand
    ? rows.map(row => ({
        ...row,
        trendUpper: row.trend + 6,
        trendLower: row.trend - 6,
      }))
    : rows;
  const title =
    titleState === 'none'
      ? undefined
      : titleState === 'long'
        ? 'Monthly revenue across every regional sales program and reporting period'
        : 'Monthly revenue';
  const subtitle =
    titleState === 'long'
      ? 'A deliberately expanded description that verifies the chart heading wraps without hiding the plot or creating horizontal scrolling.'
      : undefined;

  const dataSeries = [
    {
      isBar: args.revenueMark === 'bar',
      def: playgroundSeries(
        'revenue',
        'Revenue',
        args.revenueMark,
        revenueColor,
        args,
      ),
    },
    {
      isBar: args.trendMark === 'bar',
      def: playgroundSeries('trend', 'Trend', args.trendMark, trendColor, args),
    },
  ];
  // Opaque bars draw first, so translucent annotations above them stay
  // visible. Lines, areas and dots draw last.
  const series: SeriesDef[] = [
    ...dataSeries.filter(s => s.isBar).map(s => s.def),
    ...(args.targetRange
      ? [
          referenceLine({
            y: 40,
            y2: 50,
            label: 'Acceptable',
            color: dataVars['--color-data-gray-3'],
            bandOpacity: 0.15,
          }),
        ]
      : []),
    ...(args.trendBand
      ? [
          band({
            upper: 'trendUpper',
            lower: 'trendLower',
            color: trendColor,
            opacity: 0.2,
          }),
        ]
      : []),
    ...(args.targetLine
      ? [
          referenceLine({
            y: 60,
            label: 'Target',
            color: dataVars['--color-data-gray-4'],
          }),
        ]
      : []),
    ...dataSeries.filter(s => !s.isBar).map(s => s.def),
  ];

  return (
    <Chart
      data={data}
      xKey="month"
      series={series}
      title={title}
      subtitle={subtitle}
      legend={
        legendPosition === 'off'
          ? false
          : {position: legendPosition, alignment: legendAlignment}
      }
      tooltip={hasTooltip ? {hoverIndicator, showHoverDots} : false}
      grid={
        <ChartGrid
          horizontal={args.horizontalGrid}
          vertical={args.verticalGrid}
        />
      }
      axes={
        <>
          <ChartAxis
            position="bottom"
            showAxisLine={args.bottomAxisLine}
            showTicks={args.showTicks}
          />
          <ChartAxis
            position="left"
            showAxisLine={args.leftAxisLine}
            showTicks={args.showTicks}
          />
        </>
      }
      yBaseline={args.yBaseline}
      yDomain={
        args.fixedYDomain ? [args.yDomainMin, args.yDomainMax] : undefined
      }
      height={height}
    />
  );
}

/**
 * Chart root with controls for marks, layout, curve, tooltip, annotations,
 * grid and axes, y range and legend, plus the empty, large-data and long-title
 * states. The default args draw grouped bars for Revenue and a line for Trend.
 */
export const Playground: Story = {
  render: args => <PlaygroundChart {...args} />,
};

/** The chart-state stories render fixed scenarios, so they show no controls. */
const fixedScenario = {controls: {disable: true}};

function CompactAxes() {
  const locale = useLocale();
  return (
    <>
      <ChartAxis position="bottom" />
      <ChartAxis
        position="left"
        tickFormat={value => compactNumber(value, locale)}
      />
    </>
  );
}

const Y_BASELINES = [
  {yBaseline: 'auto', title: 'yBaseline="auto" (default)'},
  {yBaseline: 'zero', title: 'yBaseline="zero"'},
  {yBaseline: 'data', title: 'yBaseline="data"'},
] as const;

/**
 * `yBaseline` sets how the y axis fits the data when `yDomain` is not set.
 * With `auto`, a chart with only lines or dots gets headroom: 8% of the data
 * range above and below. `zero` makes the axis symmetric around 0. `data` fits
 * the data range with no headroom. Every mode then rounds the axis ends out to
 * round numbers.
 *
 * To check: subscribers go from 12.4K in January to 28.9K in December. With
 * `auto` the labels run from 10K to 30K, and the axis has headroom above 30K.
 * With `zero` the labels run from −30K to 30K, so the line uses only the top
 * half. With `data` the labels run from 15K to 30K, and January sits just
 * above the bottom edge, below the 15K label.
 */
export const YBaselineLine: Story = {
  name: 'Y baseline: line',
  parameters: fixedScenario,
  render: () => (
    <Grid columns={{minWidth: 280, max: 3}} gap={6}>
      {Y_BASELINES.map(({yBaseline, title}) => (
        <Chart
          key={yBaseline}
          data={subscriberGrowthData}
          xKey="month"
          title={title}
          subtitle="Newsletter subscribers at the end of each month"
          series={[line('subscribers', {label: 'Subscribers'})]}
          yBaseline={yBaseline}
          tooltip
          grid={<ChartGrid />}
          axes={<CompactAxes />}
          height={220}
        />
      ))}
    </Grid>
  ),
};

/**
 * The same three `yBaseline` modes on bars. A bar always grows from 0, so its
 * length shows its value only when 0 is on the axis. With `auto`, a chart
 * with bars or areas always includes 0. This story shows current behavior.
 *
 * - `zero` makes the axis symmetric, so all-positive bars use only the top
 *   half of the plot.
 * - `data` starts the axis near the smallest value. 0 is then below the plot,
 *   so each bar loses its bottom part at the plot edge, and the bar lengths no
 *   longer compare. A fixed `yDomain` that leaves out 0 does the same.
 *
 * To check: revenue goes from $79.6K in February to $152.3K in December. With
 * `auto` the labels run from 0 to 150K, the axis has headroom above 150K, and
 * every bar starts at 0. With `zero` the labels run from −200K to 200K, and
 * the bars start at the 0 line in the middle. With `data` the labels run from
 * 80K to 160K, with no 0 label: the bars start at the bottom edge of the plot,
 * below the 80K label, and December looks almost six times as tall as
 * January, not 1.8 times.
 */
export const YBaselineBar: Story = {
  name: 'Y baseline: bars',
  parameters: fixedScenario,
  render: () => (
    <Grid columns={{minWidth: 280, max: 3}} gap={6}>
      {Y_BASELINES.map(({yBaseline, title}) => (
        <Chart
          key={yBaseline}
          data={monthlyRevenueData}
          xKey="month"
          title={title}
          subtitle="Monthly revenue in US dollars"
          series={[bar('revenue', {label: 'Revenue'})]}
          yBaseline={yBaseline}
          tooltip
          grid={<ChartGrid />}
          axes={<CompactAxes />}
          height={220}
        />
      ))}
    </Grid>
  ),
};

/**
 * `yDomain` sets the exact ends of the y axis. The chart does not round them
 * and ignores `yBaseline`. Use it to keep the same scale across charts or
 * reloads. Marks are clipped to the plot, so values outside the domain are cut
 * at the plot edge. The tooltip still shows the real value.
 *
 * To check: the axis runs from exactly 0 to 300 ms. The line leaves the top of
 * the plot just after 1,000 users (290 ms), and the 410 ms and 580 ms points
 * are not drawn. Hover 1,200 users: the tooltip reads 580.
 */
export const FixedYDomain: Story = {
  name: 'Fixed y domain',
  parameters: fixedScenario,
  render: () => (
    <Chart
      data={latencyByConcurrencyData}
      xKey="users"
      title="Response time under load"
      subtitle="95th-percentile response time in milliseconds, by concurrent users. The y axis is fixed at 0–300 ms"
      series={[line('p95LatencyMs', {label: 'p95 response time'})]}
      yDomain={[0, 300]}
      tooltip
      grid={<ChartGrid />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      height={300}
    />
  ),
};

const CASH_FLOW_MONTHS = [
  {
    month: 'Jan',
    productSales: 62000,
    services: 18000,
    payroll: -41000,
    suppliers: -20600,
  },
  {
    month: 'Feb',
    productSales: 48000,
    services: 15000,
    payroll: -41000,
    suppliers: -28200,
  },
  {
    month: 'Mar',
    productSales: 66000,
    services: 19500,
    payroll: -42000,
    suppliers: -19400,
  },
  {
    month: 'Apr',
    productSales: 51000,
    services: 16200,
    payroll: -42000,
    suppliers: -38000,
  },
  {
    month: 'May',
    productSales: 58000,
    services: 17100,
    payroll: -43000,
    suppliers: -22400,
  },
  {
    month: 'Jun',
    productSales: 54000,
    services: 16600,
    payroll: -43000,
    suppliers: -31000,
  },
];

/** Cash in and out per month in US dollars. Money out is negative. */
const cashFlowData = CASH_FLOW_MONTHS.map(row => ({
  ...row,
  net: row.productSales + row.services + row.payroll + row.suppliers,
}));

/**
 * Positive and negative values in one column need two stacks: one for the
 * series that are always positive and one for the series that are always
 * negative. Each stack grows from 0, so money in goes up and money out goes
 * down. Neither stack has a `group`, so in current behavior both draw in the
 * same column. A line shows the net.
 *
 * Current behavior: series with different signs in one `stack` do not split
 * at 0. Stacking adds each value to the running total, so a negative series
 * starts at the top of the positive series below it and draws back over it.
 *
 * To check: in every month the Product sales and Payroll bars touch at the 0
 * grid line, and no bars overlap. April has the largest money out ($80K, the
 * bottom of the axis) and a net of −$12.8K. March has the largest money in
 * ($85.5K) and a net of $24.1K.
 */
export const MixedSignStacks: Story = {
  name: 'Mixed signs: two stacks',
  parameters: fixedScenario,
  render: () => (
    <Chart
      data={cashFlowData}
      xKey="month"
      title="Monthly cash flow"
      subtitle="Money in and out in US dollars, January to June. Money out is negative"
      series={[
        bar('productSales', {label: 'Product sales', stack: 'in'}),
        bar('services', {label: 'Services', stack: 'in'}),
        bar('payroll', {label: 'Payroll', stack: 'out'}),
        bar('suppliers', {label: 'Suppliers', stack: 'out'}),
        line('net', {label: 'Net cash flow', dots: true}),
      ]}
      legend
      tooltip
      grid={<ChartGrid />}
      axes={<CompactAxes />}
      height={320}
    />
  ),
};

const styles = stylex.create({
  phoneWidth: {
    width: '100%',
    maxWidth: 358,
  },
});

/**
 * Both charts are at most 358 px wide: a 390 px phone screen less the page
 * padding. A legend at the top or bottom wraps and keeps the full plot.
 *
 * Current behavior: with the legend at the start or end, the chart sizes the
 * plot for its full width, as if there were no legend. The legend then takes
 * part of that width, so the end of the plot is cut off. This happens at
 * every width. On a narrow chart it hides whole months.
 *
 * To check: the bottom-legend chart shows all 12 months, January to December.
 * The end-legend chart shows the legend beside the plot. November, December
 * and part of October are cut off at the legend.
 */
export const NarrowSideLegend: Story = {
  name: 'Narrow width: side legend',
  parameters: fixedScenario,
  render: () => (
    <VStack gap={8} xstyle={styles.phoneWidth}>
      {(['bottom', 'end'] as const).map(position => (
        <Chart
          key={position}
          data={visitsByDeviceData}
          xKey="month"
          title={`Legend: ${position}`}
          subtitle="Website visits per month, by device"
          series={[
            bar('mobile', {label: 'Mobile', group: 'device'}),
            bar('desktop', {label: 'Desktop', group: 'device'}),
          ]}
          legend={{position}}
          tooltip
          grid={<ChartGrid />}
          axes={<CompactAxes />}
          height={240}
        />
      ))}
    </VStack>
  ),
};
