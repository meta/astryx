// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Data Dashboard — a generic user-analytics dashboard.
 *
 * Content-only (root `Layout`); the host supplies the app shell. Modeled after
 * dense metric-monitoring dashboards: a filter bar and grids of small metric
 * cards — each with a sparkline and multi-period deltas (d/d, w/w, m/m, y/y)
 * with red/green direction coloring.
 *
 *   filter bar | key metrics | devices trend | demographics | acquisition
 *
 * Every metric is generic and self-contained (no real users, no proprietary
 * data). All figures are deterministic (fixed fixtures, no clocks/random) so
 * previews stay stable.
 */

import {useState, type CSSProperties} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  VStack,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Divider} from '@astryxdesign/core/Divider';
import {Badge} from '@astryxdesign/core/Badge';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Selector} from '@astryxdesign/core/Selector';
import {Table, proportional, pixel} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
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
  UsersIcon,
  CursorArrowRaysIcon,
} from '@heroicons/react/24/outline';
import {StopIcon} from '@heroicons/react/24/solid';

// ============= TYPES =============

type Segment = 'all' | 'new' | 'returning';
type DateRange = '7d' | '30d' | '90d';
type DeviceFilter = 'all' | 'mobile' | 'desktop' | 'tablet';

// Period-over-period change, in percent: day, week, month, and year.
interface Deltas {
  dd: number;
  ww: number;
  mm: number;
  yy: number;
}

// One point of a sparkline, pre-shaped for recharts so the fixtures do the
// work once at module load instead of on every render of every card.
interface SparkPoint {
  i: number;
  v: number;
}

interface Metric {
  key: string;
  label: string;
  value: string;
  // Whether a rising value is good (engagement) or bad (bounce rate).
  higherIsBetter: boolean;
  deltas: Deltas;
  spark: SparkPoint[];
}

// ============= COLORS (design tokens w/ hex fallbacks) =============

const COLORS = {
  blue: 'var(--color-data-categorical-blue, #0171E3)',
  green: 'var(--color-data-categorical-green, #0B991F)',
  orange: 'var(--color-data-categorical-orange, #EB6E00)',
  purple: 'var(--color-data-categorical-purple, #6B1EFD)',
  teal: 'var(--color-data-categorical-teal, #08A3A3)',
  neutral: 'var(--color-data-neutral, #8494A3)',
};
const GRID_STROKE = 'var(--color-border, rgba(5, 54, 89, 0.1))';
const AXIS_TICK = {
  fontSize: 'var(--font-size-sm, 12px)',
  fill: 'var(--color-text-secondary, #4E606F)',
};

// ============= DETERMINISTIC SERIES =============

// A full quarter. The sparklines and the active-users trend both span this
// window, so the card-level and chart-level views of the data agree.
const TREND_DAYS = 90;

// Hash-based noise in [0, 1) — deterministic, so previews never shift.
// Shared by the metric sparklines and the active-users trend below.
function noise(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Build a stable but spiky sparkline series: a trend line, a weekly rhythm, a
// mean-reverting drift, per-point jitter, and the occasional outlier burst.
function spark(seed: number, trend: number): SparkPoint[] {
  const out: SparkPoint[] = [];
  let drift = 0;
  for (let i = 0; i < TREND_DAYS; i++) {
    const base = 50 + (trend * i * 24) / TREND_DAYS;
    const weekly = Math.sin((i * Math.PI * 2) / 7 + seed) * 2.5;
    drift = drift * 0.72 + (noise(i, seed) - 0.5) * 7;
    const jitter = (noise(i, seed + 17) - 0.5) * 8;
    const burst =
      noise(i, seed + 91) > 0.9 ? (noise(i, seed + 43) - 0.4) * 20 : 0;
    out.push({i, v: Math.round(base + weekly + drift + jitter + burst)});
  }
  return out;
}

// ============= OVERVIEW METRICS =============

const OVERVIEW_METRICS: Metric[] = [
  {
    key: 'active-users',
    label: 'Active users',
    value: '1.28M',
    higherIsBetter: true,
    deltas: {dd: 0.4, ww: 2.1, mm: 6.4, yy: 18.2},
    spark: spark(1, 1.1),
  },
  {
    key: 'new-users',
    label: 'New users',
    value: '184.2K',
    higherIsBetter: true,
    deltas: {dd: 1.2, ww: 3.8, mm: 9.1, yy: 24.6},
    spark: spark(2, 1.4),
  },
  {
    key: 'sessions',
    label: 'Sessions',
    value: '4.62M',
    higherIsBetter: true,
    deltas: {dd: 0.2, ww: 1.4, mm: 5.2, yy: 15.9},
    spark: spark(3, 0.9),
  },
  {
    key: 'avg-session',
    label: 'Avg. session',
    value: '6m 42s',
    higherIsBetter: true,
    deltas: {dd: -0.3, ww: 0.8, mm: 2.1, yy: -4.3},
    spark: spark(4, 0.3),
  },
  {
    key: 'pages-session',
    label: 'Pages / session',
    value: '5.3',
    higherIsBetter: true,
    deltas: {dd: 0.1, ww: -0.6, mm: 1.2, yy: 3.7},
    spark: spark(5, 0.4),
  },
  {
    key: 'bounce',
    label: 'Bounce rate',
    value: '38.6%',
    higherIsBetter: false,
    deltas: {dd: -0.2, ww: -1.1, mm: -2.4, yy: -6.8},
    spark: spark(6, -0.5),
  },
  {
    key: 'dau-mau',
    label: 'DAU / MAU',
    value: '52.1%',
    higherIsBetter: true,
    deltas: {dd: 0.3, ww: 1.0, mm: 3.2, yy: 8.4},
    spark: spark(7, 0.7),
  },
  {
    key: 'conversion',
    label: 'Conversion rate',
    value: '3.84%',
    higherIsBetter: true,
    deltas: {dd: -0.1, ww: 0.9, mm: 2.6, yy: 11.2},
    spark: spark(8, 0.6),
  },
  {
    key: 'activation',
    label: 'Activation rate',
    value: '61.4%',
    higherIsBetter: true,
    deltas: {dd: 0.2, ww: 1.3, mm: 4.1, yy: 12.7},
    spark: spark(9, 0.8),
  },
  {
    key: 'retention-30',
    label: '30-day retention',
    value: '27.4%',
    higherIsBetter: true,
    deltas: {dd: 0.1, ww: -0.4, mm: 1.8, yy: 5.3},
    spark: spark(10, -0.3),
  },
  {
    key: 'churn',
    label: 'Churn rate',
    value: '4.7%',
    higherIsBetter: false,
    deltas: {dd: -0.1, ww: -0.5, mm: -1.3, yy: -3.9},
    spark: spark(11, -0.6),
  },
  {
    key: 'load-time',
    label: 'Avg. load time',
    value: '1.4s',
    higherIsBetter: false,
    deltas: {dd: 0.2, ww: 0.6, mm: -2.2, yy: -8.1},
    spark: spark(12, 0.35),
  },
];

// Active-users trend: the desktop/mobile/tablet split across TREND_DAYS.
// Weekends swing traffic from desktop to mobile, and each day carries its own
// jitter plus the occasional spike, so the series reads like real telemetry.
const ACTIVE_TREND = (() => {
  const out: {
    t: number;
    label: string;
    desktop: number;
    mobile: number;
    tablet: number;
  }[] = [];
  for (let i = 0; i < TREND_DAYS; i++) {
    const weekend = i % 7 === 5 || i % 7 === 6;
    const spike = noise(i, 61) > 0.88 ? 1 : 0;
    // Slopes are expressed as total drift across the window, so the shape
    // holds if TREND_DAYS changes.
    out.push({
      t: i,
      label: `Day ${i + 1}`,
      desktop: Math.round(
        520 +
          (i * 90) / TREND_DAYS +
          (weekend ? -110 : 20) +
          (noise(i, 11) - 0.5) * 80,
      ),
      mobile: Math.round(
        680 +
          (i * 150) / TREND_DAYS +
          (weekend ? 85 : -15) +
          (noise(i, 23) - 0.5) * 125 +
          spike * 130,
      ),
      tablet: Math.round(
        140 + (weekend ? 24 : -5) + (noise(i, 37) - 0.5) * 40 + spike * 18,
      ),
    });
  }
  return out;
})();

// Four evenly spaced labels (roughly month boundaries), derived so the axis
// stays readable if TREND_DAYS changes.
const ACTIVE_TICK_COUNT = 4;
const ACTIVE_TICKS = Array.from({length: ACTIVE_TICK_COUNT}, (_, i) =>
  Math.round((i * (TREND_DAYS - 1)) / (ACTIVE_TICK_COUNT - 1)),
);

// ============= DEMOGRAPHICS =============

interface BreakdownSegment {
  label: string;
  value: number;
  color: string;
}

const AGE_DATA: BreakdownSegment[] = [
  {label: '18–24', value: 26, color: COLORS.blue},
  {label: '25–34', value: 34, color: COLORS.teal},
  {label: '35–44', value: 21, color: COLORS.green},
  {label: '45–54', value: 12, color: COLORS.orange},
  {label: '55+', value: 7, color: COLORS.neutral},
];

const GENDER_DATA: BreakdownSegment[] = [
  {label: 'Female', value: 48, color: COLORS.purple},
  {label: 'Male', value: 46, color: COLORS.blue},
  {label: 'Other / undisclosed', value: 6, color: COLORS.neutral},
];

const DEVICE_DATA: BreakdownSegment[] = [
  {label: 'Mobile', value: 58, color: COLORS.blue},
  {label: 'Desktop', value: 34, color: COLORS.teal},
  {label: 'Tablet', value: 8, color: COLORS.orange},
];

interface AcqRow extends Record<string, unknown> {
  id: string;
  channel: string;
  users: number;
  share: number;
  delta: number;
}

const ACQUISITION: AcqRow[] = [
  {id: 'a1', channel: 'Organic search', users: 486200, share: 38, delta: 4.2},
  {id: 'a2', channel: 'Direct', users: 295400, share: 23, delta: 1.1},
  {id: 'a3', channel: 'Social', users: 217800, share: 17, delta: 8.6},
  {id: 'a4', channel: 'Referral', users: 141900, share: 11, delta: -2.3},
  {id: 'a5', channel: 'Email', users: 89200, share: 7, delta: 3.4},
  {id: 'a6', channel: 'Paid ads', users: 51300, share: 4, delta: -1.8},
];

const ACQ_MAX = Math.max(...ACQUISITION.map(a => a.users));

// ============= FILTER OPTIONS =============

const RANGE_OPTIONS = [
  {value: '7d', label: 'Last 7 days'},
  {value: '30d', label: 'Last 30 days'},
  {value: '90d', label: 'Last 90 days'},
];
const SEGMENT_OPTIONS = [
  {value: 'all', label: 'All users'},
  {value: 'new', label: 'New users'},
  {value: 'returning', label: 'Returning users'},
];
const DEVICE_OPTIONS = [
  {value: 'all', label: 'All devices'},
  {value: 'mobile', label: 'Mobile'},
  {value: 'desktop', label: 'Desktop'},
  {value: 'tablet', label: 'Tablet'},
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

// Locale is pinned: this is a client component, and letting the server and the
// browser pick different default locales produces a hydration mismatch (and
// breaks the deterministic previews this template promises).
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

// ============= METRIC MINI-CARD (with sparkline + 4 deltas) =============

// Direction is carried by the arrow next to the metric value; the delta
// figures themselves stay neutral so a card with four of them doesn't turn
// into a wall of red and green.
function DeltaValue({label, value}: {label: string; value: number}) {
  const flat = value === 0;
  const sign = value > 0 ? '+' : '';
  return (
    <Text type="body" weight="bold" color="primary" hasTabularNumbers>
      {flat ? '—' : `${sign}${value.toFixed(1)}%`}{' '}
      <Text type="inherit" weight="normal" color="secondary">
        {label}
      </Text>
    </Text>
  );
}

// The sparkline restates the trend the value and arrow already convey, so it
// is decorative: hidden from assistive tech rather than announced as an
// unlabelled chart.
function MiniSparkline({data, color}: {data: SparkPoint[]; color: string}) {
  return (
    <div aria-hidden="true">
      <ResponsiveContainer width="100%" height={48}>
        <LineChart data={data} margin={{top: 4, right: 0, left: 0, bottom: 0}}>
          <Line
            type="linear"
            dataKey="v"
            stroke={color}
            strokeWidth={1.25}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Deltas sit in a 2x2 grid rather than a wrapping row so the four figures line
// up across every card regardless of how wide the number renders.
function MetricCard({metric}: {metric: Metric}) {
  const trendUp = metric.deltas.ww >= 0;
  const favorable = metric.higherIsBetter ? trendUp : !trendUp;
  const sparkColor = favorable ? COLORS.green : COLORS.orange;
  return (
    <Card padding={4}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Text type="label" color="secondary">
            {metric.label}
          </Text>
          <HStack gap={2} vAlign="center">
            {/* Sized as the card's hero number, but demoted in the document
                outline: these sit under the section's h2, not beside the
                page's h1. */}
            <Heading level={1} accessibilityLevel={3}>
              {metric.value}
            </Heading>
            <Icon
              icon={trendUp ? ArrowUpIcon : ArrowDownIcon}
              size="sm"
              color={favorable ? 'success' : 'error'}
            />
          </HStack>
        </VStack>
        <MiniSparkline data={metric.spark} color={sparkColor} />
        <Grid columns={2} gap={2}>
          <DeltaValue label="d/d" value={metric.deltas.dd} />
          <DeltaValue label="w/w" value={metric.deltas.ww} />
          <DeltaValue label="m/m" value={metric.deltas.mm} />
          <DeltaValue label="y/y" value={metric.deltas.yy} />
        </Grid>
      </VStack>
    </Card>
  );
}

// Grid's `columns` prop carries a single minWidth, so the roomier track floor
// for wide viewports rides in as an xstyle override: Grid routes its track
// template through a CSS var and applies `xstyle` last, so this wins. Below
// the breakpoint the value is left unset and the `columns` prop stands.
const METRICS_WIDE = '@media (min-width: 900px)';

const metricsGridStyles = stylex.create({
  grid: {
    gridTemplateColumns: {
      default: null,
      [METRICS_WIDE]: 'repeat(auto-fit, minmax(320px, 1fr))',
    },
  },
});

// ============= ACTIVE USERS TREND =============

interface TrendTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function ActiveTrendTooltip({
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
  const day =
    typeof label === 'number' ? (ACTIVE_TREND[label]?.label ?? '') : '';
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          {day}
        </Text>
        {payload.map(entry => (
          <LegendDot
            key={entry.name}
            color={entry.color}
            label={`${entry.name}: ${formatNumber(entry.value)}K`}
          />
        ))}
      </VStack>
    </Card>
  );
}

function ActiveUsersTrend() {
  return (
    <VStack gap={3}>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={ACTIVE_TREND}
          margin={{top: 5, right: 12, left: 0, bottom: 5}}>
          <defs>
            <linearGradient id="au-mobile" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="au-desktop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid horizontal vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, TREND_DAYS - 1]}
            ticks={ACTIVE_TICKS}
            tickFormatter={(v: number) => ACTIVE_TREND[v]?.label ?? ''}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={40}
            unit="K"
          />
          <Tooltip
            content={<ActiveTrendTooltip />}
            cursor={{stroke: GRID_STROKE}}
          />
          <Area
            type="linear"
            dataKey="mobile"
            name="Mobile"
            stroke={COLORS.blue}
            strokeWidth={1.5}
            strokeLinejoin="miter"
            fill="url(#au-mobile)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="desktop"
            name="Desktop"
            stroke={COLORS.teal}
            strokeWidth={1.5}
            strokeLinejoin="miter"
            fill="url(#au-desktop)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="tablet"
            name="Tablet"
            stroke={COLORS.orange}
            strokeWidth={1.5}
            strokeLinejoin="miter"
            fill="none"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <HStack gap={5} vAlign="center" wrap="wrap">
        <LegendDot color={COLORS.blue} label="Mobile" />
        <LegendDot color={COLORS.teal} label="Desktop" />
        <LegendDot color={COLORS.orange} label="Tablet" />
      </HStack>
    </VStack>
  );
}

// ============= BREAKDOWN (horizontal stacked bar) =============

function BreakdownCard({
  title,
  data,
}: {
  title: string;
  data: BreakdownSegment[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = [Object.fromEntries(data.map(d => [d.label, d.value]))];
  return (
    <Card>
      <VStack gap={4}>
        {/* Card-title sizing, but h3 in the outline — these sit under the
            "Audience demographics" h2, so level 4 would skip a rank. */}
        <Heading level={4} accessibilityLevel={3}>
          {title}
        </Heading>
        <ResponsiveContainer width="100%" height={24}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{top: 0, right: 0, bottom: 0, left: 0}}
            barCategoryGap={0}>
            <XAxis type="number" hide domain={[0, total]} />
            <YAxis type="category" hide />
            {data.map((d, i) => (
              <Bar
                key={d.label}
                dataKey={d.label}
                stackId="s"
                fill={d.color}
                isAnimationActive={false}
                radius={
                  i === 0
                    ? [4, 0, 0, 4]
                    : i === data.length - 1
                      ? [0, 4, 4, 0]
                      : [0, 0, 0, 0]
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <VStack gap={2}>
          {data.map(d => (
            <HStack key={d.label} hAlign="between" vAlign="center">
              <LegendDot color={d.color} label={d.label} />
              <Text type="supporting" weight="semibold" hasTabularNumbers>
                {d.value}%
              </Text>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

// ============= TABLES =============

function DeltaBadge({value}: {value: number}) {
  const flat = value === 0;
  return (
    <Badge
      variant={flat ? 'neutral' : value > 0 ? 'green' : 'red'}
      label={`${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
    />
  );
}

const acquisitionColumns: TableColumn<AcqRow>[] = [
  {
    key: 'channel',
    header: 'Channel',
    width: pixel(160),
    renderCell: (item: AcqRow) => (
      <Text type="body" weight="semibold">
        {item.channel}
      </Text>
    ),
  },
  {
    key: 'users',
    header: 'Users',
    width: proportional(1),
    renderCell: (item: AcqRow) => (
      <VStack gap={1}>
        <ProgressBar
          value={item.users}
          max={ACQ_MAX}
          label={`${item.channel} users`}
          isLabelHidden
        />
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {formatNumber(item.users)}
        </Text>
      </VStack>
    ),
  },
  {
    key: 'share',
    header: 'Share',
    width: pixel(90),
    renderCell: (item: AcqRow) => (
      <Text type="body" hasTabularNumbers>
        {item.share}%
      </Text>
    ),
  },
  {
    key: 'delta',
    header: 'w/w',
    width: pixel(100),
    renderCell: (item: AcqRow) => <DeltaBadge value={item.delta} />,
  },
];

// ============= SECTION HEADING =============

// AspectRatio takes its width from the container, and as a flex child its own
// `width: 100%` would resolve against the whole header row. Pinning a width
// here gives it the definite box it needs and makes the tile a 32px square.
const sectionIconStyles = stylex.create({
  tile: {
    width: 'var(--spacing-8)',
    backgroundColor: 'var(--color-background-muted)',
    borderRadius: 'var(--radius-element)',
  },
});

function SectionHeading({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: typeof UsersIcon;
}) {
  return (
    <HStack hAlign="between" vAlign="center" gap={3}>
      <HStack gap={3} vAlign="center">
        {icon ? (
          <AspectRatio ratio={1} fit="center" xstyle={sectionIconStyles.tile}>
            <Icon icon={icon} size="sm" color="secondary" />
          </AspectRatio>
        ) : null}
        <Heading level={2}>{title}</Heading>
      </HStack>
      {hint ? (
        <Text type="supporting" color="secondary">
          {hint}
        </Text>
      ) : null}
    </HStack>
  );
}

// ============= MAIN =============

// The filters are presentational: the fixtures are a fixed snapshot, so the
// controls annotate the view rather than re-slicing the data. Swapping the
// fixtures for a query is the seam a consumer replaces.
function labelFor(
  options: readonly {value: string; label: string}[],
  value: string,
): string {
  return options.find(o => o.value === value)?.label ?? '';
}

export default function DataDashboardPage() {
  // Matches TREND_DAYS — the fixtures render a full quarter.
  const [range, setRange] = useState<DateRange>('90d');
  const [segment, setSegment] = useState<Segment>('all');
  const [device, setDevice] = useState<DeviceFilter>('all');

  const summary = [
    labelFor(SEGMENT_OPTIONS, segment),
    labelFor(DEVICE_OPTIONS, device),
    labelFor(RANGE_OPTIONS, range),
  ].join(' · ');

  return (
    <Layout
      height="fill"
      contentWidth={1440}
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={0}>
              <Heading level={1}>Data Dashboard</Heading>
              <Text type="supporting" color="secondary">
                User analytics overview · {summary}
              </Text>
            </VStack>
            <HStack gap={1}>
              <Selector
                label="Date range"
                isLabelHidden
                options={RANGE_OPTIONS}
                value={range}
                onChange={value => setRange(value as DateRange)}
              />
              <Selector
                label="Segment"
                isLabelHidden
                options={SEGMENT_OPTIONS}
                value={segment}
                onChange={value => setSegment(value as Segment)}
              />
              <Selector
                label="Device"
                isLabelHidden
                options={DEVICE_OPTIONS}
                value={device}
                onChange={value => setDevice(value as DeviceFilter)}
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
        <LayoutContent padding={6}>
          <VStack gap={10}>
            <VStack gap={6}>
              <SectionHeading
                title="Key metrics"
                hint="Change vs. prior day, week, month, and year"
                icon={UsersIcon}
              />
              <Grid
                columns={{minWidth: 240, repeat: 'fit'}}
                gap={3}
                xstyle={metricsGridStyles.grid}>
                {OVERVIEW_METRICS.map(metric => (
                  <MetricCard key={metric.key} metric={metric} />
                ))}
              </Grid>
            </VStack>

            <VStack gap={6}>
              <SectionHeading
                title="Devices"
                hint="Daily active users (thousands)"
                icon={CursorArrowRaysIcon}
              />
              <Card padding={6}>
                <VStack gap={6}>
                  <Text type="label">Daily active users by device type</Text>
                  <ActiveUsersTrend />
                </VStack>
              </Card>
            </VStack>

            <Divider />

            <VStack gap={6}>
              <SectionHeading
                title="Audience demographics"
                hint="Share of active users"
                icon={UsersIcon}
              />
              <Grid columns={{minWidth: 320, repeat: 'fit'}} gap={4}>
                <BreakdownCard title="Age" data={AGE_DATA} />
                <BreakdownCard title="Gender" data={GENDER_DATA} />
                <BreakdownCard title="Device" data={DEVICE_DATA} />
              </Grid>
            </VStack>

            <VStack gap={6}>
              <SectionHeading
                title="Acquisition channels"
                hint="How users find the product"
              />
              <Card>
                <Table<AcqRow>
                  data={ACQUISITION}
                  columns={acquisitionColumns}
                  idKey="id"
                  density="balanced"
                  dividers="rows"
                  hasHover
                />
              </Card>
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
