// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  Chart,
  ChartAxis,
  ChartGrid,
  area,
  band,
  bar,
  dot,
  line,
  referenceLine,
  useChartColors,
  type LegendAlignment,
  type SeriesDef,
  type YBaseline,
} from '@astryxdesign/charts';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {monthlyData} from './_data';

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
    curve: 'monotone',
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
