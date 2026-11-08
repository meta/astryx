// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Funnel & Cohort Analytics — a growth / product-analytics dashboard.
 *
 * Content-only (root `Layout`); the host supplies the app shell. Composed of
 * distinct analytics widgets stacked in the content column:
 *
 *   KPI row | conversion funnel (stage bars + step drop-off)
 *          | conversion-over-time trend | cohort retention grid
 *
 * The segment control (All / Web / iOS / Android) and the funnel window
 * (7d / 30d / 90d) reshape the funnel, the trend chart, and the KPIs. Cohort
 * retention is a table of Token-colored cells (heatmap-by-value). All data is
 * deterministic (fixed fixtures, no clocks/random) so previews stay stable.
 */

import {useMemo, useState, type CSSProperties} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  VStack,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Divider} from '@astryxdesign/core/Divider';
import {Token} from '@astryxdesign/core/Token';
import {Selector} from '@astryxdesign/core/Selector';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Table, pixel} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import {StopIcon} from '@heroicons/react/24/solid';

// ============= TYPES =============

type Segment = 'all' | 'web' | 'ios' | 'android';
type FunnelWindow = '7d' | '30d' | '90d';

interface FunnelStage {
  key: string;
  label: string;
  // Absolute users entering this stage, per segment.
  users: Record<Segment, number>;
}

// ============= COLORS (design tokens w/ hex fallbacks) =============

const COLORS = {
  blue: 'var(--color-data-categorical-blue, #0171E3)',
  green: 'var(--color-data-categorical-green, #0B991F)',
  orange: 'var(--color-data-categorical-orange, #EB6E00)',
  purple: 'var(--color-data-categorical-purple, #6B1EFD)',
  teal: 'var(--color-data-categorical-teal, #08A3A3)',
};
const GRID_STROKE = 'var(--color-border, rgba(5, 54, 89, 0.1))';
const AXIS_TICK = {
  fontSize: 'var(--font-size-sm, 12px)',
  fill: 'var(--color-text-secondary, #4E606F)',
};

// Funnel bars step through the categorical palette top-to-bottom.
const FUNNEL_COLORS = [
  COLORS.blue,
  COLORS.teal,
  COLORS.green,
  COLORS.orange,
  COLORS.purple,
];

// ============= STYLES =============

const styles = stylex.create({
  // Rules between the drop-off steps. Each step draws its own leading rule,
  // pulled half a gap to the left so it sits centred in the column gap. The
  // step that starts a row draws its rule outside the grid's content box,
  // where `overflowX: clip` hides it — so the separators stay correct as the
  // grid reflows from four columns down to one.
  //
  // The `--spacing-3` below must match the step Grid's `gap={3}`, otherwise
  // the rules sit off-centre. StyleX needs a literal here, so the two can't
  // share a constant — keep them in sync by hand.
  stepGrid: {
    overflowX: 'clip',
  },
  step: {
    borderInlineStartWidth: '1px',
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: 'var(--color-border, rgba(5, 54, 89, 0.1))',
    marginInlineStart: 'calc(var(--spacing-3, 12px) / -2)',
    paddingInlineStart: 'calc(var(--spacing-3, 12px) / 2)',
  },
});

// ============= FUNNEL DATA =============

// Window multipliers applied to the base (30d) stage counts.
const WINDOW_FACTOR: Record<FunnelWindow, number> = {
  '7d': 0.24,
  '30d': 1,
  '90d': 3.1,
};

const FUNNEL_STAGES: FunnelStage[] = [
  {
    key: 'visit',
    label: 'Visited site',
    users: {all: 128400, web: 82600, ios: 27300, android: 18500},
  },
  {
    key: 'signup',
    label: 'Signed up',
    users: {all: 41200, web: 24800, ios: 9600, android: 6800},
  },
  {
    key: 'activate',
    label: 'Activated',
    users: {all: 22600, web: 12900, ios: 5900, android: 3800},
  },
  {
    key: 'subscribe',
    label: 'Subscribed',
    users: {all: 9100, web: 5100, ios: 2600, android: 1400},
  },
  {
    key: 'retain',
    label: 'Retained 30d',
    users: {all: 6300, web: 3600, ios: 1850, android: 850},
  },
];

// ============= CONVERSION-OVER-TIME =============

interface TrendPoint {
  t: number;
  label: string;
  signup: number;
  activate: number;
  subscribe: number;
}

// Weekly stage-conversion rates (%). Signup->activate->subscribe.
//
// Shaped as a plausible growth story rather than a smooth ramp, so the chart
// reads like real telemetry: a W7 pricing test lifts paid conversion, a W9-W10
// onboarding regression sinks activation until a fix ships, a W15 acquisition
// campaign spikes signups with low-intent traffic (activation dips as signup
// peaks, and the two series cross), W18 is an outage week that knocks all three
// down together, and W19+ recovers to a net-upward trend.
const TREND: TrendPoint[] = [
  {t: 0, label: 'W1', signup: 30.1, activate: 52.4, subscribe: 38.2},
  {t: 1, label: 'W2', signup: 31.4, activate: 54.1, subscribe: 36.9},
  {t: 2, label: 'W3', signup: 29.2, activate: 51.2, subscribe: 39.8},
  {t: 3, label: 'W4', signup: 32.6, activate: 55.8, subscribe: 37.1},
  {t: 4, label: 'W5', signup: 28.4, activate: 53.6, subscribe: 40.4},
  {t: 5, label: 'W6', signup: 31.8, activate: 56.2, subscribe: 38.3},
  {t: 6, label: 'W7', signup: 33.5, activate: 54.3, subscribe: 44.6},
  {t: 7, label: 'W8', signup: 30.2, activate: 57.1, subscribe: 42.1},
  {t: 8, label: 'W9', signup: 34.1, activate: 48.9, subscribe: 37.4},
  {t: 9, label: 'W10', signup: 29.6, activate: 46.2, subscribe: 35.2},
  {t: 10, label: 'W11', signup: 32.9, activate: 50.4, subscribe: 38.9},
  {t: 11, label: 'W12', signup: 35.4, activate: 55.6, subscribe: 41.3},
  {t: 12, label: 'W13', signup: 31.1, activate: 57.3, subscribe: 39.2},
  {t: 13, label: 'W14', signup: 33.8, activate: 54.8, subscribe: 42.8},
  {t: 14, label: 'W15', signup: 41.2, activate: 49.6, subscribe: 40.1},
  {t: 15, label: 'W16', signup: 38.6, activate: 47.8, subscribe: 36.4},
  {t: 16, label: 'W17', signup: 30.4, activate: 53.2, subscribe: 39.7},
  {t: 17, label: 'W18', signup: 26.8, activate: 44.1, subscribe: 34.2},
  {t: 18, label: 'W19', signup: 31.9, activate: 51.7, subscribe: 38.1},
  {t: 19, label: 'W20', signup: 34.7, activate: 56.4, subscribe: 41.9},
  {t: 20, label: 'W21', signup: 32.2, activate: 58.2, subscribe: 44.2},
  {t: 21, label: 'W22', signup: 36.1, activate: 55.1, subscribe: 40.6},
  {t: 22, label: 'W23', signup: 33.4, activate: 59.4, subscribe: 43.8},
  {t: 23, label: 'W24', signup: 37.2, activate: 56.8, subscribe: 46.1},
  {t: 24, label: 'W25', signup: 34.9, activate: 60.1, subscribe: 42.7},
  {t: 25, label: 'W26', signup: 38.4, activate: 58.6, subscribe: 45.3},
];

// One row per plotted series, so the chart lines and the legend below it can't
// drift apart — both are rendered from this list.
const TREND_SERIES = [
  {key: 'signup', name: 'Visit → signup', color: COLORS.blue},
  {key: 'activate', name: 'Signup → activation', color: COLORS.green},
  {key: 'subscribe', name: 'Activation → paid', color: COLORS.orange},
] as const;

// Label every fifth week. Derived from TREND so the axis stays in-domain when
// the fixture grows or shrinks.
const TREND_TICK_STEP = 5;
const TREND_TICKS = Array.from(
  {length: Math.ceil(TREND.length / TREND_TICK_STEP)},
  (_, i) => i * TREND_TICK_STEP,
);
const formatTrendTick = (v: number) => TREND[v]?.label ?? '';

// ============= COHORT RETENTION =============

interface Cohort {
  label: string;
  size: number;
  // Retention % by week index (week 0 = 100 by definition).
  retention: number[];
}

const COHORTS: Cohort[] = [
  {
    label: 'Apr 6 – Apr 12',
    size: 4820,
    retention: [100, 62, 48, 41, 37, 34, 32, 31],
  },
  {
    label: 'Apr 13 – Apr 19',
    size: 5140,
    retention: [100, 64, 50, 43, 39, 36, 34],
  },
  {label: 'Apr 20 – Apr 26', size: 5390, retention: [100, 66, 52, 45, 41, 38]},
  {label: 'Apr 27 – May 3', size: 5610, retention: [100, 63, 49, 42, 38]},
  {label: 'May 4 – May 10', size: 5980, retention: [100, 67, 54, 47]},
  {label: 'May 11 – May 17', size: 6240, retention: [100, 69, 56]},
  {label: 'May 18 – May 24', size: 6510, retention: [100, 71]},
  {label: 'May 25 – May 31', size: 6720, retention: [100]},
];

const MAX_WEEKS = 8;

// Map a retention percentage to a Token color (green = sticky, red = leaky).
function retentionColor(
  pct: number,
): 'green' | 'teal' | 'yellow' | 'orange' | 'red' {
  if (pct >= 70) {
    return 'green';
  }
  if (pct >= 50) {
    return 'teal';
  }
  if (pct >= 40) {
    return 'yellow';
  }
  if (pct >= 32) {
    return 'orange';
  }
  return 'red';
}

// ============= KPIS =============

interface Kpi {
  key: string;
  label: string;
  value: string;
  delta: number;
  higherIsBetter: boolean;
}

const KPIS: Record<Segment, Kpi[]> = {
  all: [
    {
      key: 'v2s',
      label: 'Visit → signup',
      value: '32.1%',
      delta: 1.8,
      higherIsBetter: true,
    },
    {
      key: 's2a',
      label: 'Signup → activation',
      value: '54.9%',
      delta: 2.4,
      higherIsBetter: true,
    },
    {
      key: 'a2s',
      label: 'Activation → paid',
      value: '40.3%',
      delta: -1.1,
      higherIsBetter: true,
    },
    {
      key: 'w4',
      label: 'Week-4 retention',
      value: '43.2%',
      delta: 3.6,
      higherIsBetter: true,
    },
  ],
  web: [
    {
      key: 'v2s',
      label: 'Visit → signup',
      value: '30.0%',
      delta: 1.2,
      higherIsBetter: true,
    },
    {
      key: 's2a',
      label: 'Signup → activation',
      value: '52.0%',
      delta: 1.9,
      higherIsBetter: true,
    },
    {
      key: 'a2s',
      label: 'Activation → paid',
      value: '39.5%',
      delta: -0.6,
      higherIsBetter: true,
    },
    {
      key: 'w4',
      label: 'Week-4 retention',
      value: '41.8%',
      delta: 2.9,
      higherIsBetter: true,
    },
  ],
  ios: [
    {
      key: 'v2s',
      label: 'Visit → signup',
      value: '35.2%',
      delta: 2.6,
      higherIsBetter: true,
    },
    {
      key: 's2a',
      label: 'Signup → activation',
      value: '61.5%',
      delta: 3.1,
      higherIsBetter: true,
    },
    {
      key: 'a2s',
      label: 'Activation → paid',
      value: '44.1%',
      delta: 0.8,
      higherIsBetter: true,
    },
    {
      key: 'w4',
      label: 'Week-4 retention',
      value: '47.5%',
      delta: 4.2,
      higherIsBetter: true,
    },
  ],
  android: [
    {
      key: 'v2s',
      label: 'Visit → signup',
      value: '36.8%',
      delta: 2.1,
      higherIsBetter: true,
    },
    {
      key: 's2a',
      label: 'Signup → activation',
      value: '55.9%',
      delta: 1.4,
      higherIsBetter: true,
    },
    {
      key: 'a2s',
      label: 'Activation → paid',
      value: '36.8%',
      delta: -2.3,
      higherIsBetter: true,
    },
    {
      key: 'w4',
      label: 'Week-4 retention',
      value: '38.4%',
      delta: -0.9,
      higherIsBetter: true,
    },
  ],
};

const SEGMENT_OPTIONS = [
  {value: 'all', label: 'All platforms'},
  {value: 'web', label: 'Web'},
  {value: 'ios', label: 'iOS'},
  {value: 'android', label: 'Android'},
];

// ============= SHARED PIECES =============

// Icon's `color` prop only takes semantic names, but the legend swatch must
// match the exact chart series color — inline color required (same pattern as
// the shipped dashboard templates).
function LegendDot({color, label}: {color: string; label: string}) {
  const dotStyle: CSSProperties = {color};
  return (
    <HStack gap={2} vAlign="center">
      <Icon icon={StopIcon} size="xsm" style={dotStyle} />
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </HStack>
  );
}

function nf(n: number): string {
  return n.toLocaleString();
}

// ============= KPI TILE =============

function KpiTile({kpi}: {kpi: Kpi}) {
  const favorable = kpi.higherIsBetter ? kpi.delta >= 0 : kpi.delta <= 0;
  return (
    <Card padding={4}>
      <VStack gap={1}>
        <Text type="label" color="secondary">
          {kpi.label}
        </Text>
        <HStack gap={3}>
          <Heading level={1}>{kpi.value}</Heading>
          <HStack gap={1} vAlign="center">
            <Icon
              icon={kpi.delta >= 0 ? ArrowUpIcon : ArrowDownIcon}
              size="xsm"
              color={favorable ? 'success' : 'error'}
            />
            <Text type="supporting" color="secondary">
              {kpi.delta >= 0 ? '+' : ''}
              {kpi.delta.toFixed(1)} pts vs. prior
            </Text>
          </HStack>
        </HStack>
      </VStack>
    </Card>
  );
}

// ============= FUNNEL =============

interface FunnelBar {
  key: string;
  label: string;
  users: number;
  pctOfTop: number;
  stepPct: number | null;
  color: string;
}

interface FunnelTooltipEntry {
  payload: FunnelBar;
}

function FunnelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: FunnelTooltipEntry[];
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const bar = payload[payload.length - 1].payload;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="body" weight="semibold">
          {bar.label}
        </Text>
        <Text type="supporting" color="secondary">
          {nf(bar.users)} users · {bar.pctOfTop.toFixed(1)}% of top
        </Text>
        {bar.stepPct != null && (
          <Text type="supporting" color="secondary">
            {bar.stepPct.toFixed(1)}% from previous step
          </Text>
        )}
      </VStack>
    </Card>
  );
}

function ConversionFunnel({segment}: {segment: Segment}) {
  const bars = useMemo<FunnelBar[]>(() => {
    const top = FUNNEL_STAGES[0].users[segment];
    return FUNNEL_STAGES.map((stage, i) => {
      const users = stage.users[segment];
      const prev = i > 0 ? FUNNEL_STAGES[i - 1].users[segment] : null;
      return {
        key: stage.key,
        label: stage.label,
        users,
        pctOfTop: (users / top) * 100,
        stepPct: prev != null ? (users / prev) * 100 : null,
        color: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
      };
    });
  }, [segment]);

  return (
    <VStack gap={4}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={bars}
          layout="vertical"
          margin={{top: 0, right: 24, left: 8, bottom: 0}}
          barCategoryGap={10}>
          <CartesianGrid horizontal={false} vertical stroke={GRID_STROKE} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={110}
          />
          <Tooltip content={<FunnelTooltip />} cursor={{fill: GRID_STROKE}} />
          <Bar dataKey="users" radius={4} isAnimationActive={false}>
            {bars.map(bar => (
              <Cell key={bar.key} fill={bar.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </VStack>
  );
}

// Step-by-step drop-off cards beneath the funnel.
function FunnelSteps({segment}: {segment: Segment}) {
  const steps = useMemo(() => {
    return FUNNEL_STAGES.slice(1).map((stage, i) => {
      const prev = FUNNEL_STAGES[i];
      const from = prev.users[segment];
      const to = stage.users[segment];
      const conv = (to / from) * 100;
      const drop = 100 - conv;
      return {
        key: stage.key,
        label: `${prev.label} → ${stage.label}`,
        conv,
        drop,
      };
    });
  }, [segment]);

  return (
    <Grid
      columns={{minWidth: 200, repeat: 'fit'}}
      gap={3}
      xstyle={styles.stepGrid}>
      {steps.map(step => {
        const leaky = step.drop >= 55;
        return (
          <VStack key={step.key} gap={1} xstyle={styles.step}>
            <Text type="label" color="secondary">
              {step.label}
            </Text>
            <HStack gap={2} vAlign="center">
              <Heading level={2}>{step.conv.toFixed(1)}%</Heading>
              <Token
                size="sm"
                color={leaky ? 'red' : 'green'}
                icon={
                  <Icon
                    icon={ArrowTrendingDownIcon}
                    size="xsm"
                    color="inherit"
                  />
                }
                label={`-${step.drop.toFixed(0)}%`}
              />
            </HStack>
          </VStack>
        );
      })}
    </Grid>
  );
}

// ============= CONVERSION TREND =============

interface TrendTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TrendTooltipEntry[];
  label?: number;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const wk = typeof label === 'number' ? (TREND[label]?.label ?? '') : '';
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          {wk}
        </Text>
        {payload.map(entry => (
          <LegendDot
            key={entry.name}
            color={entry.color}
            label={`${entry.name}: ${entry.value.toFixed(1)}%`}
          />
        ))}
      </VStack>
    </Card>
  );
}

function ConversionTrend() {
  return (
    <VStack gap={3}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={TREND}
          margin={{top: 5, right: 12, left: 0, bottom: 5}}>
          <CartesianGrid horizontal vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, TREND.length - 1]}
            ticks={TREND_TICKS}
            tickFormatter={formatTrendTick}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={40}
            unit="%"
          />
          <Tooltip content={<TrendTooltip />} cursor={{stroke: GRID_STROKE}} />
          {TREND_SERIES.map(series => (
            <Line
              key={series.key}
              type="linear"
              dataKey={series.key}
              name={series.name}
              stroke={series.color}
              strokeWidth={1.5}
              strokeLinejoin="miter"
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <HStack gap={5} vAlign="center" wrap="wrap">
        {TREND_SERIES.map(series => (
          <LegendDot
            key={series.key}
            color={series.color}
            label={series.name}
          />
        ))}
      </HStack>
    </VStack>
  );
}

// ============= COHORT RETENTION GRID =============

interface CohortRow extends Record<string, unknown> {
  id: string;
  label: string;
  size: number;
  retention: number[];
}

function buildCohortColumns(): TableColumn<CohortRow>[] {
  const cols: TableColumn<CohortRow>[] = [
    {
      key: 'label',
      header: 'Cohort',
      width: pixel(150),
      renderCell: (item: CohortRow) => (
        <Text type="body" weight="semibold">
          {item.label}
        </Text>
      ),
    },
    {
      key: 'size',
      header: 'Users',
      width: pixel(90),
      renderCell: (item: CohortRow) => (
        <Text type="body" color="secondary">
          {nf(item.size)}
        </Text>
      ),
    },
  ];
  for (let week = 0; week < MAX_WEEKS; week++) {
    cols.push({
      key: `w${week}`,
      header: `W${week}`,
      width: pixel(72),
      renderCell: (item: CohortRow) => {
        const pct = item.retention[week];
        if (pct == null) {
          return (
            <Text type="supporting" color="secondary">
              —
            </Text>
          );
        }
        return (
          <Token size="sm" color={retentionColor(pct)} label={`${pct}%`} />
        );
      },
    });
  }
  return cols;
}

const cohortColumns = buildCohortColumns();
const cohortRows: CohortRow[] = COHORTS.map((c, i) => ({
  id: `c${i}`,
  label: c.label,
  size: c.size,
  retention: c.retention,
}));

// ============= SECTION HEADING =============

function SectionHeading({title, hint}: {title: string; hint?: string}) {
  return (
    <VStack>
      <Heading level={2}>{title}</Heading>
      {hint ? (
        <Text type="supporting" color="secondary">
          {hint}
        </Text>
      ) : null}
    </VStack>
  );
}

// ============= MAIN =============

export default function FunnelCohortAnalyticsPage() {
  const [segment, setSegment] = useState<Segment>('all');
  const [funnelWindow, setFunnelWindow] = useState<FunnelWindow>('30d');

  const kpis = KPIS[segment];
  const topOfFunnel = useMemo(() => {
    const base = FUNNEL_STAGES[0].users[segment];
    return Math.round(base * WINDOW_FACTOR[funnelWindow]);
  }, [segment, funnelWindow]);

  const overallConversion = useMemo(() => {
    const top = FUNNEL_STAGES[0].users[segment];
    const bottom = FUNNEL_STAGES[FUNNEL_STAGES.length - 1].users[segment];
    return ((bottom / top) * 100).toFixed(1);
  }, [segment]);

  return (
    <Layout
      height="fill"
      padding={4}
      contentWidth={1440}
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={0}>
              <Heading level={1}>Funnel & cohort analytics</Heading>
              <Text type="supporting" color="secondary">
                {nf(topOfFunnel)} visitors · {overallConversion}% end-to-end
                conversion
              </Text>
            </VStack>
            <HStack gap={2}>
              <SegmentedControl
                label="Funnel window"
                value={funnelWindow}
                onChange={value => setFunnelWindow(value as FunnelWindow)}>
                <SegmentedControlItem label="7d" value="7d" />
                <SegmentedControlItem label="30d" value="30d" />
                <SegmentedControlItem label="90d" value="90d" />
              </SegmentedControl>
              <Selector
                label="Segment"
                isLabelHidden
                options={SEGMENT_OPTIONS}
                value={segment}
                onChange={value => setSegment(value as Segment)}
              />
              <Button
                label="Export"
                variant="secondary"
                icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <VStack gap={10}>
            <VStack gap={4}>
              {/* KPI row */}
              <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={3}>
                {kpis.map(kpi => (
                  <KpiTile key={kpi.key} kpi={kpi} />
                ))}
              </Grid>

              {/* Conversion funnel */}
              <Card padding={6}>
                <VStack gap={6}>
                  <SectionHeading
                    title="Conversion funnel"
                    hint={`${SEGMENT_OPTIONS.find(o => o.value === segment)?.label} · ${funnelWindow}`}
                  />
                  <ConversionFunnel segment={segment} />
                  <Divider />
                  <FunnelSteps segment={segment} />
                </VStack>
              </Card>

              {/* Conversion over time */}
              <Card padding={6}>
                <VStack gap={6}>
                  <SectionHeading
                    title="Conversion over time"
                    hint={`Stage conversion rates · trailing ${TREND.length} weeks`}
                  />
                  <ConversionTrend />
                </VStack>
              </Card>
            </VStack>

            <Divider />

            {/* Cohort retention grid */}
            <VStack gap={6}>
              <SectionHeading
                title="Weekly retention cohorts"
                hint="Signup week × weeks since signup"
              />
              <Card padding={6}>
                <VStack gap={8}>
                  <Table<CohortRow>
                    data={cohortRows}
                    columns={cohortColumns}
                    idKey="id"
                    density="balanced"
                    dividers="rows"
                  />
                  <HStack gap={4} vAlign="center" wrap="wrap">
                    <Text type="supporting" color="secondary">
                      Retention:
                    </Text>
                    <HStack gap={2} vAlign="center">
                      <Token size="sm" color="red" label="< 32%" />
                      <Token size="sm" color="orange" label="32–40%" />
                      <Token size="sm" color="yellow" label="40–50%" />
                      <Token size="sm" color="teal" label="50–70%" />
                      <Token size="sm" color="green" label="≥ 70%" />
                    </HStack>
                  </HStack>
                </VStack>
              </Card>
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
