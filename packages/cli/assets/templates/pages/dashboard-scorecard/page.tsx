// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, useState, type CSSProperties} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  VStack,
  HStack,
  StackItem,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Grid} from '@astryxdesign/core/Grid';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Divider} from '@astryxdesign/core/Divider';
import {Avatar} from '@astryxdesign/core/Avatar';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {ArrowDownTrayIcon} from '@heroicons/react/24/outline';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  StopIcon,
} from '@heroicons/react/24/solid';

// ============= TYPES =============

type Period = 'WoW' | 'MoM' | 'QoQ';
type Rag = 'green' | 'amber' | 'red';

interface Kpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  // Delta percentage per period; sign drives arrow + RAG.
  delta: Record<Period, number>;
  // Whether an increase is good (revenue) or bad (churn, cost).
  higherIsBetter: boolean;
}

interface Okr {
  objective: string;
  owner: string;
  actual: number;
  target: number;
  unit: string;
}

interface TrendSeries {
  key: string;
  title: string;
  unit: string;
  kind: 'area' | 'line';
  color: string;
  // 12 periods of [current, prior] pairs.
  data: {t: number; label: string; current: number; prior: number}[];
}

// ============= RAG COLOR MAPPING =============

const RAG_ICON: Record<Rag, 'success' | 'warning' | 'error'> = {
  green: 'success',
  amber: 'warning',
  red: 'error',
};

// A delta becomes RAG by magnitude + whether the direction is favorable.
function ragFor(deltaPct: number, higherIsBetter: boolean): Rag {
  const favorable = higherIsBetter ? deltaPct >= 0 : deltaPct <= 0;
  const mag = Math.abs(deltaPct);
  if (favorable) {
    return mag >= 1 ? 'green' : 'amber';
  }
  return mag >= 3 ? 'red' : 'amber';
}

// ============= CHART COLORS (design tokens w/ hex fallbacks) =============

const COLORS = {
  blue: 'var(--color-data-categorical-blue, #0171E3)',
  green: 'var(--color-data-categorical-green, #0B991F)',
  orange: 'var(--color-data-categorical-orange, #EB6E00)',
  purple: 'var(--color-data-categorical-purple, #6B1EFD)',
  prior: 'var(--color-text-secondary, #737373)',
};
const GRID_STROKE = 'var(--color-border, rgba(5, 54, 89, 0.1))';
const AXIS_TICK = {
  fontSize: 'var(--font-size-sm, 12px)',
  fill: 'var(--color-text-secondary, #4E606F)',
};

// ============= SCORECARD DATA =============

const KPIS: Kpi[] = [
  {
    key: 'revenue',
    label: 'Net revenue',
    value: '$4.82M',
    delta: {WoW: 2.4, MoM: 6.1, QoQ: 14.3},
    higherIsBetter: true,
  },
  {
    key: 'arr',
    label: 'ARR',
    value: '$58.1M',
    delta: {WoW: 1.1, MoM: 3.8, QoQ: 11.2},
    higherIsBetter: true,
  },
  {
    key: 'nrr',
    label: 'Net revenue retention',
    value: '112%',
    delta: {WoW: 0.3, MoM: -0.8, QoQ: 2.1},
    higherIsBetter: true,
  },
  {
    key: 'churn',
    label: 'Gross churn',
    value: '1.9%',
    delta: {WoW: 0.4, MoM: 1.6, QoQ: -0.7},
    higherIsBetter: false,
  },
  {
    key: 'cac',
    label: 'CAC payback',
    value: '14.2 mo',
    delta: {WoW: -0.2, MoM: -3.4, QoQ: -8.1},
    higherIsBetter: false,
  },
  {
    key: 'nps',
    label: 'NPS',
    value: '48',
    delta: {WoW: 1.0, MoM: 4.0, QoQ: 6.0},
    higherIsBetter: true,
  },
];

// The scorecard is one flat grid of 6 tiles: 1 column (small), 2 (medium),
// 3 (large) — i.e. 1x6, 2x3, 3x2. The tiers are pinned to viewport width
// rather than derived from tile width via auto-fill, so the breakpoints are
// explicit. The ranges are non-overlapping, so exactly one ever matches and
// the result can't depend on StyleX's at-rule ordering or on source order.
const SCORECARD_MEDIUM = '@media (min-width: 768px) and (max-width: 1199.98px)';
const SCORECARD_LARGE = '@media (min-width: 1200px)';

// Overrides Grid's own grid-template-columns. Grid routes its track template
// through a CSS var and applies `xstyle` last, so this wins.
const scorecardStyles = stylex.create({
  grid: {
    gridTemplateColumns: {
      default: '1fr',
      [SCORECARD_MEDIUM]: 'repeat(2, 1fr)',
      [SCORECARD_LARGE]: 'repeat(3, 1fr)',
    },
  },
});

// ============= OKR / GOAL ATTAINMENT =============

const OKRS: Okr[] = [
  {
    objective: 'Reach $60M ARR',
    owner: 'Dana Whitfield · CRO',
    actual: 58.1,
    target: 60,
    unit: 'M',
  },
  {
    objective: 'Expand into 3 new enterprise verticals',
    owner: 'Marcus Lin · VP Sales',
    actual: 2,
    target: 3,
    unit: '',
  },
  {
    objective: 'Ship AI copilot GA',
    owner: 'Priya Raman · VP Product',
    actual: 82,
    target: 100,
    unit: '%',
  },
  {
    objective: 'Improve gross margin to 78%',
    owner: 'Tom Okafor · CFO',
    actual: 75.4,
    target: 78,
    unit: '%',
  },
];

function okrRag(pct: number): Rag {
  if (pct >= 90) {
    return 'green';
  }
  if (pct >= 70) {
    return 'amber';
  }
  return 'red';
}

const RAG_PROGRESS: Record<Rag, 'success' | 'warning' | 'error'> = {
  green: 'success',
  amber: 'warning',
  red: 'error',
};

// ============= TREND DATA (period-over-period) =============

const WEEK_LABELS = [
  'W1',
  'W2',
  'W3',
  'W4',
  'W5',
  'W6',
  'W7',
  'W8',
  'W9',
  'W10',
  'W11',
  'W12',
];

function makeTrend(
  base: number,
  growth: number,
  priorGap: number,
  wobble: number,
): {t: number; label: string; current: number; prior: number}[] {
  return WEEK_LABELS.map((label, i) => {
    const drift = base * (1 + (growth * i) / 11);
    const wob = Math.sin(i * 1.3) * base * wobble;
    const current = Math.round(drift + wob);
    const prior = Math.round((drift + wob) * (1 - priorGap));
    return {t: i, label, current, prior};
  });
}

const TRENDS: TrendSeries[] = [
  {
    key: 'revenue',
    title: 'Net revenue',
    unit: 'k',
    kind: 'area',
    color: COLORS.blue,
    data: makeTrend(980, 0.24, 0.12, 0.03),
  },
  {
    key: 'pipeline',
    title: 'Qualified pipeline',
    unit: 'k',
    kind: 'area',
    color: COLORS.green,
    data: makeTrend(3200, 0.31, 0.18, 0.05),
  },
  {
    key: 'activation',
    title: 'Activation rate',
    unit: '%',
    kind: 'line',
    color: COLORS.purple,
    data: makeTrend(42, 0.28, 0.09, 0.04),
  },
  {
    key: 'support',
    title: 'Support CSAT',
    unit: '%',
    kind: 'line',
    color: COLORS.orange,
    data: makeTrend(88, 0.06, 0.03, 0.02),
  },
];

// ============= AUTO-GENERATED NARRATIVE =============

type CalloutStatus = 'success' | 'warning' | 'info';

interface Callout {
  status: CalloutStatus;
  title: string;
  detail: string;
}

const NARRATIVE: Record<Period, Callout[]> = {
  WoW: [
    {
      status: 'success',
      title: 'Net revenue up 2.4% week-over-week',
      detail:
        'Driven by three enterprise renewals closing early in the East region; expansion ARR contributed 60% of the lift.',
    },
    {
      status: 'warning',
      title: 'Gross churn ticked up 0.4 points',
      detail:
        'Two mid-market logos churned on price; both flagged in QBRs last month. Save-play in motion for the remaining at-risk cohort.',
    },
    {
      status: 'info',
      title: 'CAC payback holding at 14.2 months',
      detail:
        'Paid acquisition efficiency steady; the shift toward partner-sourced pipeline is starting to show in blended CAC.',
    },
  ],
  MoM: [
    {
      status: 'success',
      title: 'Revenue accelerating: +6.1% month-over-month',
      detail:
        'Second consecutive month of accelerating growth. New-logo bookings and expansion both above plan; net-new pipeline covers 3.2x of next quarter target.',
    },
    {
      status: 'warning',
      title: 'NRR dipped 0.8 points to 112%',
      detail:
        'A seasonal downgrade cycle in the SMB segment pulled retention down slightly. Enterprise NRR remains above 120%.',
    },
    {
      status: 'success',
      title: 'CAC payback improved 3.4 points',
      detail:
        'Sales efficiency gains from the new SDR playbook are compounding; payback now inside the 15-month board target.',
    },
  ],
  QoQ: [
    {
      status: 'success',
      title: 'Strong quarter: revenue +14.3%, ARR +11.2%',
      detail:
        'Best quarter on record for net-new ARR. Two of three new verticals landed anchor customers; the AI copilot beta is converting at 2x the baseline trial rate.',
    },
    {
      status: 'success',
      title: 'Churn down 0.7 points quarter-over-quarter',
      detail:
        'Retention initiatives launched in Q1 are paying off; gross churn at a two-year low and NRR up 2.1 points.',
    },
    {
      status: 'warning',
      title: 'Gross margin at 75.4%, short of the 78% goal',
      detail:
        'Infrastructure cost from the AI copilot GA ramp is the primary drag. Finance projects margin recovery once usage-based pricing lands next quarter.',
    },
  ],
};

const PERIOD_SUBTITLE: Record<Period, string> = {
  WoW: 'Week of Jun 23 – Jun 29, 2026 vs. prior week',
  MoM: 'June 2026 vs. May 2026',
  QoQ: 'Q2 2026 vs. Q1 2026',
};

// ============= SHARED PIECES =============

// Icon's `color` prop only accepts semantic names, but the legend swatch must
// match the exact data-categorical stroke of its chart line — so an inline
// color is required here (same pattern as the shipped dashboard templates).
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

// Up / down for movement, right for flat — the solid arrow set keeps the delta
// marker as visually weighty as the value it sits next to.
const DELTA_ICON = {
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  flat: ArrowRightIcon,
};

function DeltaIndicator({deltaPct, rag}: {deltaPct: number; rag: Rag}) {
  const sign = deltaPct > 0 ? '+' : '';
  const direction = deltaPct === 0 ? 'flat' : deltaPct < 0 ? 'down' : 'up';
  return (
    <HStack gap={2} vAlign="center">
      <Text type="body" color="secondary">
        {sign}
        {deltaPct.toFixed(1)}%
      </Text>
      <Icon icon={DELTA_ICON[direction]} size="xsm" color={RAG_ICON[rag]} />
    </HStack>
  );
}

interface TrendTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function makeTrendTooltip(unit: string) {
  return function TrendTooltip({
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
    const wk =
      typeof label === 'number'
        ? (WEEK_LABELS[label] ?? '')
        : String(label ?? '');
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
              label={`${entry.name}: ${entry.value.toLocaleString()}${unit}`}
            />
          ))}
        </VStack>
      </Card>
    );
  };
}

// ============= SCORECARD =============

function ScorecardTile({kpi, period}: {kpi: Kpi; period: Period}) {
  const deltaPct = kpi.delta[period];
  const rag = ragFor(deltaPct, kpi.higherIsBetter);
  return (
    <Card padding={5}>
      <VStack gap={1}>
        <Text type="label" color="secondary">
          {kpi.label}
        </Text>
        <HStack gap={4} vAlign="center">
          <Heading level={2}>{kpi.value}</Heading>
          <DeltaIndicator deltaPct={deltaPct} rag={rag} />
        </HStack>
      </VStack>
    </Card>
  );
}

// ============= OKR ATTAINMENT =============

function OkrRow({okr}: {okr: Okr}) {
  const pct = Math.round((okr.actual / okr.target) * 100);
  const rag = okrRag(pct);
  // `owner` is "Name · Title"; the avatar wants the person, not the title.
  const ownerName = okr.owner.split('·')[0].trim();
  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center" gap={3}>
        <StackItem size="fill">
          <Heading level={4}>{okr.objective}</Heading>
        </StackItem>
        <Text type="supporting" color="secondary">
          {pct}%
        </Text>
      </HStack>
      <ProgressBar
        value={okr.actual}
        max={okr.target}
        variant={RAG_PROGRESS[rag]}
        label={okr.objective}
        isLabelHidden
      />
      <HStack hAlign="between" vAlign="center" gap={4}>
        <HStack gap={2} vAlign="center">
          <Avatar size="sm" name={ownerName} />
          <Text type="supporting" color="secondary">
            {okr.owner}
          </Text>
        </HStack>
        <Text type="supporting" color="secondary">
          {okr.actual}
          {okr.unit} / {okr.target}
          {okr.unit} target
        </Text>
      </HStack>
    </VStack>
  );
}

// ============= TREND CHART =============

function TrendChart({trend}: {trend: TrendSeries}) {
  const gradientId = `grad-${trend.key}`;
  const TrendTooltip = useMemo(
    () => makeTrendTooltip(trend.unit),
    [trend.unit],
  );
  const latest = trend.data[trend.data.length - 1];
  const deltaPct = Math.round(
    ((latest.current - latest.prior) / latest.prior) * 100,
  );
  return (
    <Card padding={5}>
      <VStack gap={6}>
        <HStack hAlign="between" vAlign="center">
          <HStack gap={2}>
            <Heading level={3}>{trend.title}</Heading>
            <Heading level={3} color="secondary">
              {latest.current.toLocaleString()}
              {trend.unit}
            </Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            {deltaPct >= 0 ? '+' : ''}
            {deltaPct}% vs prior
          </Text>
        </HStack>
        <ResponsiveContainer width="100%" height={200}>
          {trend.kind === 'area' ? (
            <AreaChart
              data={trend.data}
              margin={{top: 5, right: 8, left: 0, bottom: 0}}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trend.color} stopOpacity={0.3} />
                  <stop
                    offset="95%"
                    stopColor={trend.color}
                    stopOpacity={0.04}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, 11]}
                ticks={[0, 3, 7, 11]}
                tickFormatter={(v: number) => WEEK_LABELS[v] ?? ''}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={<TrendTooltip />}
                cursor={{stroke: GRID_STROKE}}
              />
              <Area
                type="monotone"
                dataKey="prior"
                name="Prior"
                stroke={COLORS.prior}
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="current"
                name="Current"
                stroke={trend.color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <LineChart
              data={trend.data}
              margin={{top: 5, right: 8, left: 0, bottom: 0}}>
              <CartesianGrid horizontal vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, 11]}
                ticks={[0, 3, 7, 11]}
                tickFormatter={(v: number) => WEEK_LABELS[v] ?? ''}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={<TrendTooltip />}
                cursor={{stroke: GRID_STROKE}}
              />
              <Line
                type="monotone"
                dataKey="prior"
                name="Prior"
                stroke={COLORS.prior}
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="current"
                name="Current"
                stroke={trend.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
        <HStack gap={5} vAlign="center">
          <LegendDot color={trend.color} label="Current" />
          <LegendDot color={COLORS.prior} label="Prior" />
        </HStack>
      </VStack>
    </Card>
  );
}

// ============= NARRATIVE =============

// Each callout is a discrete, independently-removable observation, so Card is
// the right container. Card variants are for categorization, not status — the
// status reads from the leading icon (glyph + semantic color + accessible
// name), never from the card surface.
const CALLOUT_ICON: Record<CalloutStatus, 'success' | 'warning' | 'info'> = {
  success: 'success',
  warning: 'warning',
  info: 'info',
};

const CALLOUT_ICON_COLOR: Record<
  CalloutStatus,
  'success' | 'warning' | 'accent'
> = {
  success: 'success',
  warning: 'warning',
  info: 'accent',
};

const CALLOUT_LABEL: Record<CalloutStatus, string> = {
  success: 'Positive',
  warning: 'Needs attention',
  info: 'Context',
};

function NarrativeCard({callout}: {callout: Callout}) {
  return (
    <Card padding={5}>
      <HStack gap={3} vAlign="start">
        <Icon
          icon={CALLOUT_ICON[callout.status]}
          color={CALLOUT_ICON_COLOR[callout.status]}
          size="md"
          label={CALLOUT_LABEL[callout.status]}
        />
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={4}>{callout.title}</Heading>
            <Text type="body" color="secondary">
              {callout.detail}
            </Text>
          </VStack>
        </StackItem>
      </HStack>
    </Card>
  );
}

function NarrativeBlock({period}: {period: Period}) {
  return (
    <VStack gap={2}>
      {NARRATIVE[period].map(callout => (
        <NarrativeCard key={callout.title} callout={callout} />
      ))}
    </VStack>
  );
}

// ============= SECTION HEADING =============

function SectionHeading({title, hint}: {title: string; hint?: string}) {
  return (
    <HStack hAlign="between" vAlign="center" gap={3}>
      <Heading level={2}>{title}</Heading>
      {hint ? (
        <Text type="supporting" color="secondary">
          {hint}
        </Text>
      ) : null}
    </HStack>
  );
}

// ============= PAGE CHROME =============

const pageStyles = stylex.create({
  // Deepen the scroll container's bottom gutter past the padding={6} default so
  // the last section doesn't butt against the edge. The matching container var
  // is updated too, since bleed children (Divider, Section) read it to pull
  // themselves back out to the content edge.
  contentBottomPad: {
    paddingBlockEnd: 'var(--spacing-10)',
    '--container-padding-block-end': 'var(--spacing-10)',
  },
});

// ============= MAIN =============

export default function ExecutiveReviewPage() {
  const [period, setPeriod] = useState<Period>('WoW');
  // The narrative rail needs ~400px of its own; below that the content column
  // would be too cramped for the 2-up trend grid, so the rail folds inline.
  const isNarrow = useMediaQuery('(max-width: 1024px)');

  const okrSummary = useMemo(() => {
    const pcts = OKRS.map(o => (o.actual / o.target) * 100);
    const onTrack = pcts.filter(p => p >= 90).length;
    return `${onTrack} of ${OKRS.length} on track`;
  }, []);

  return (
    <Layout
      height="fill"
      contentWidth={1440}
      header={
        <LayoutHeader padding={6} hasDivider>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={1}>
              <Heading level={1}>Weekly Business Review</Heading>
              <HStack gap={2} vAlign="center">
                <Text type="body" color="secondary">
                  {PERIOD_SUBTITLE[period]}
                </Text>
                <Text type="body" color="secondary">
                  · Generated
                </Text>
                <Timestamp
                  value="2026-06-30T08:00:00Z"
                  format="date"
                  type="body"
                  color="secondary"
                />
              </HStack>
            </VStack>
            <HStack gap={3}>
              <SegmentedControl
                label="Comparison period"
                value={period}
                onChange={value => setPeriod(value as Period)}>
                <SegmentedControlItem label="WoW" value="WoW" />
                <SegmentedControlItem label="MoM" value="MoM" />
                <SegmentedControlItem label="QoQ" value="QoQ" />
              </SegmentedControl>
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
        <LayoutContent padding={6} xstyle={pageStyles.contentBottomPad}>
          <VStack gap={10}>
            {/* Narrative lives in the end rail; it folds in here when narrow. */}
            {isNarrow && (
              <VStack gap={6}>
                <SectionHeading title="What changed & why" hint="AI summary" />
                <NarrativeBlock period={period} />
              </VStack>
            )}

            {/* Scorecard row */}
            <VStack gap={6}>
              <SectionHeading title="Scorecards" hint="Performance metrics" />
              <Grid gap={2} xstyle={scorecardStyles.grid}>
                {KPIS.map(kpi => (
                  <ScorecardTile key={kpi.key} kpi={kpi} period={period} />
                ))}
              </Grid>
            </VStack>

            {/* OKR attainment */}
            <VStack gap={6}>
              <SectionHeading title="Goal attainment" hint={okrSummary} />
              <Card padding={6}>
                <VStack gap={6}>
                  {OKRS.map((okr, i) => (
                    <VStack gap={6} key={okr.objective}>
                      {i > 0 && <Divider />}
                      <OkrRow okr={okr} />
                    </VStack>
                  ))}
                </VStack>
              </Card>
            </VStack>

            {/* Trend section: 2x2 grid */}
            <VStack gap={6}>
              <SectionHeading
                title="Trends"
                hint="Current vs. prior period · trailing 12 weeks"
              />
              <Grid columns={{minWidth: 330, repeat: 'fit'}} gap={3}>
                {TRENDS.map(trend => (
                  <TrendChart key={trend.key} trend={trend} />
                ))}
              </Grid>
            </VStack>
          </VStack>
        </LayoutContent>
      }
      end={
        isNarrow ? undefined : (
          <LayoutPanel
            width={400}
            padding={6}
            hasDivider
            role="complementary"
            label="What changed and why">
            <VStack gap={6}>
              <SectionHeading title="What changed & why" hint="AI summary" />
              <NarrativeBlock period={period} />
            </VStack>
          </LayoutPanel>
        )
      }
    />
  );
}
