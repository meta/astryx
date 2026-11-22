// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Real Recharts components styled with the active Astryx theme.
 * @input Theme tokens and illustrative quarterly sales.
 * @output A responsive chart with bounded corners, matching legend keys, and hover details.
 * @position Shared live example for the chart-color and radius references.
 */

import {useLayoutEffect, useState} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Curve,
  Dot,
  Layer,
  ZIndexLayer,
  Text as RechartsText,
  usePlotArea,
  LabelList,
  Legend,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Surface,
  Tooltip,
  XAxis,
  YAxis,
  type RectangleProps,
  type TooltipContentProps,
} from 'recharts';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {useTheme} from '@astryxdesign/core/theme';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';

import {boundedChartRadius} from './chartRadius';

const sales = [
  {quarter: 'Q1', sales: 120},
  {quarter: 'Q2', sales: 160},
  {quarter: 'Q3', sales: 140},
  {quarter: 'Q4', sales: 180},
];
const target = 150;
const money = (value: unknown) => `$${String(value)}k`;
const styles = stylex.create({
  chart: {
    width: '100%',
    minWidth: 0,
    height: 300,
    isolation: 'isolate',
    fontFamily: typographyVars['--font-family-body'],
  },
  tooltip: {
    backgroundColor: colorVars['--color-background-surface'],
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-med'],
  },
  legend: {marginBlockEnd: spacingVars['--spacing-4']},
  number: {
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-text-primary'],
    color: colorVars['--color-background-card'],
    flexShrink: 0,
    fontWeight: 600,
  },
});

export function AnatomyNumber({value}: {value: number}) {
  return (
    <Text aria-label={`Anatomy reference ${value}`} xstyle={styles.number}>
      {value}
    </Text>
  );
}

function ChartCallout({
  number,
  x,
  y,
  targetX,
  targetY,
}: {
  number: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}) {
  return (
    <ZIndexLayer zIndex={1000}>
      <Layer pointerEvents="none" aria-hidden="true">
        <Curve
          points={[
            {x, y},
            {x: targetX, y: targetY},
          ]}
          stroke={colorVars['--color-text-secondary']}
          strokeWidth={1}
          fill="none"
        />
        <Dot cx={x} cy={y} r={12} fill={colorVars['--color-text-primary']} />
        <RechartsText
          x={x}
          y={y}
          textAnchor="middle"
          verticalAnchor="middle"
          fill={colorVars['--color-background-card']}
          fontSize={14}>
          {number}
        </RechartsText>
      </Layer>
    </ZIndexLayer>
  );
}

function PlotCallout() {
  const plot = usePlotArea();
  if (!plot) {
    return null;
  }
  return (
    <ChartCallout
      number={5}
      x={plot.x + plot.width - 14}
      y={plot.y + plot.height - 24}
      targetX={plot.x + plot.width}
      targetY={plot.y + plot.height}
    />
  );
}

function SeriesKey({radius}: {radius: number}) {
  return (
    <Surface width={8} height={8} aria-hidden="true">
      <Rectangle
        x={0}
        y={0}
        width={8}
        height={8}
        radius={boundedChartRadius(radius, 8, 8)}
        fill={dataVars['--color-data-categorical-blue']}
      />
    </Surface>
  );
}

function SalesDetails({
  active,
  payload,
  label,
  radius,
  anatomy,
}: TooltipContentProps & {radius: number; anatomy: boolean}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <Card padding={3} xstyle={styles.tooltip}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          {anatomy && <AnatomyNumber value={2} />}
          <Text weight="semibold">{String(label)}</Text>
        </HStack>
        <HStack hAlign="between" gap={6}>
          <HStack gap={2} vAlign="center">
            <SeriesKey radius={radius} />
            <Text color="secondary">Sales</Text>
          </HStack>
          <Text hasTabularNumbers>{money(payload[0].value)}</Text>
        </HStack>
        <HStack hAlign="between" gap={6}>
          <Text color="secondary">Target</Text>
          <Text hasTabularNumbers>{money(target)}</Text>
        </HStack>
      </VStack>
    </Card>
  );
}

export function RechartsThemingPreview({anatomy = false}: {anatomy?: boolean}) {
  const {tokens} = useTheme();
  const [radius, setRadius] = useState(0);
  useLayoutEffect(() => {
    const value = tokens['--radius-element'];
    const length = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(value ?? '');
    if (!length) {
      throw new Error('Chart radius needs a resolved px or rem theme value');
    }
    const rootSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    setRadius(Number(length[1]) * (length[2] === 'rem' ? rootSize : 1));
  }, [tokens]);
  const tick = {
    fill: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
  };
  const roundedBar = (props: RectangleProps) => {
    const r = boundedChartRadius(radius, props.width ?? 0, props.height ?? 0);
    return (
      <Layer>
        <Rectangle {...props} radius={[r, r, 0, 0]} />
        {anatomy &&
          props.x != null &&
          props.y != null &&
          (props as RectangleProps & {index?: number}).index === 0 && (
            <ChartCallout
              number={3}
              x={props.x - 16}
              y={props.y - 20}
              targetX={props.x + r}
              targetY={props.y}
            />
          )}
      </Layer>
    );
  };
  return (
    <div
      role="group"
      aria-label="Recharts theming preview"
      {...stylex.props(styles.chart)}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={sales}
          accessibilityLayer
          title="Quarterly sales"
          desc="Q1 $120k, Q2 $160k, Q3 $140k, Q4 $180k. Target $150k per quarter."
          margin={{top: 12, right: 16, bottom: 8, left: 0}}>
          <CartesianGrid
            stroke={colorVars['--color-border']}
            vertical={false}
          />
          <XAxis
            dataKey="quarter"
            tick={tick}
            tickLine={false}
            axisLine={{stroke: colorVars['--color-border-emphasized']}}
          />
          <YAxis
            domain={[0, 200]}
            ticks={[0, 50, 100, 150, 200]}
            width={56}
            tick={tick}
            tickFormatter={money}
            tickLine={false}
            axisLine={false}
          />
          <Legend
            verticalAlign="top"
            content={() => (
              <HStack gap={4} wrap="wrap" xstyle={styles.legend}>
                <HStack gap={2} vAlign="center">
                  {anatomy && <AnatomyNumber value={4} />}
                  <SeriesKey radius={radius} />
                  <Text color="secondary">Actual sales</Text>
                </HStack>
                <HStack gap={2} vAlign="center">
                  {anatomy && <AnatomyNumber value={6} />}
                  <Surface width={28} height={8} aria-hidden="true">
                    <Curve
                      points={[
                        {x: 0, y: 4},
                        {x: 28, y: 4},
                      ]}
                      stroke={dataVars['--color-data-neutral']}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      fill="none"
                    />
                  </Surface>
                  <Text color="secondary">Target {money(target)}</Text>
                </HStack>
              </HStack>
            )}
          />
          <ReferenceLine
            y={target}
            stroke={dataVars['--color-data-neutral']}
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{fill: colorVars['--color-overlay-hover'], radius: 0}}
            content={props => (
              <SalesDetails {...props} radius={radius} anatomy={anatomy} />
            )}
          />
          <Bar
            dataKey="sales"
            name="Sales"
            fill={dataVars['--color-data-categorical-blue']}
            isAnimationActive={false}
            shape={roundedBar}>
            <LabelList
              dataKey="sales"
              position="top"
              formatter={money}
              fill={colorVars['--color-text-primary']}
              fontFamily={typographyVars['--font-family-body']}
              fontSize={typeScaleVars['--text-body-size']}
            />
          </Bar>
          {anatomy && <PlotCallout />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
