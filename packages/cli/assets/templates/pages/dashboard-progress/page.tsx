// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Project Status Dashboard — a program / launch status tracker.
 *
 * Content-only (root `Layout`); the host supplies the app shell. Widgets stack
 * down a content column capped at 1440px:
 *
 *   page header (title, program status, phase filter)
 *   | milestone Gantt with a "today" marker
 *   | progress donut + scope burndown + blockers & risks, an equal-width
 *     three-up that steps down to two columns, then one
 *   | workstream table
 *
 * The release-phase control (All / Build / Beta / GA) filters milestones,
 * workstreams and risks, each of which falls back to an empty state. Donut
 * arcs are weighted by story points rather than task count. All data is
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
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {Section} from '@astryxdesign/core/Section';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Avatar} from '@astryxdesign/core/Avatar';
import {List, ListItem} from '@astryxdesign/core/List';
import {useHoverCard} from '@astryxdesign/core/HoverCard';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Table, proportional} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ReferenceLine,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import {StopIcon} from '@heroicons/react/24/solid';

// ============= TYPES =============

type Rag = 'onTrack' | 'atRisk' | 'blocked';
type Phase = 'all' | 'build' | 'beta' | 'ga';
type ReleasePhase = Exclude<Phase, 'all'>;

interface Milestone {
  id: string;
  name: string;
  phase: ReleasePhase;
  // Day offsets on the shared TIMELINE_DAYS scale (project day 0 = kickoff).
  start: number;
  end: number;
  status: Rag;
  dateLabel: string;
}

interface Workstream extends Record<string, unknown> {
  id: string;
  name: string;
  owner: string;
  phase: ReleasePhase;
  percent: number;
  due: string;
  status: Rag;
}

interface Risk {
  id: string;
  title: string;
  workstream: string;
  phase: ReleasePhase;
  severity: Rag;
  owner: string;
  detail: string;
}

interface TaskStatusSegment {
  key: string;
  label: string;
  tasks: number;
  // Effort, not head count: `points` is what sizes the donut arc.
  points: number;
  color: string;
}

// ============= LABEL & TONE MAPPING =============

const PHASE_LABEL: Record<ReleasePhase, string> = {
  build: 'Build',
  beta: 'Beta',
  ga: 'GA',
};

const RAG_LABEL: Record<Rag, string> = {
  onTrack: 'On track',
  atRisk: 'At risk',
  blocked: 'Blocked',
};

const RAG_BADGE: Record<Rag, 'green' | 'yellow' | 'red'> = {
  onTrack: 'green',
  atRisk: 'yellow',
  blocked: 'red',
};

// Leading icon for the program-status badge in the page header, the one badge
// loud enough to earn one.
const RAG_ICON: Record<Rag, IconType> = {
  onTrack: CheckCircleIcon,
  atRisk: ExclamationTriangleIcon,
  blocked: ExclamationTriangleIcon,
};

// Chart fills for RAG status: the data-viz semantic anchors, not the UI status
// tokens (--color-success/warning/error), so a milestone bar and a "blocked"
// donut slice land on the same red.
const RAG_FILL: Record<Rag, string> = {
  onTrack: 'var(--color-data-categorical-green, #0B991F)',
  atRisk: 'var(--color-data-categorical-orange, #EB6E00)',
  blocked: 'var(--color-data-categorical-red, #F5394F)',
};

// ============= CHART CHROME (design tokens w/ hex fallbacks) =============

// The same slots `getChartColors()` resolves in @astryxdesign/charts, as CSS
// vars rather than the hook because page templates depend only on core +
// recharts. CHART_NEUTRAL is the reference-line / not-started tone.
const CHART_GRID = 'var(--color-border, rgba(5, 54, 89, 0.1))';
const CHART_LABEL = 'var(--color-text-secondary, #4E606F)';
const CHART_NEUTRAL = 'var(--color-data-neutral, #8494A3)';

const IDEAL_COLOR = CHART_NEUTRAL;
const ACTUAL_COLOR = 'var(--color-data-categorical-blue, #0171E3)';
const AXIS_TICK = {
  fontSize: 'var(--font-size-sm, 12px)',
  fill: CHART_LABEL,
};

// ============= TIMELINE SCALE =============

const TIMELINE_DAYS = 90;
const TIMELINE_TICK_STEP = 15;
const TIMELINE_TICKS = Array.from(
  {length: TIMELINE_DAYS / TIMELINE_TICK_STEP + 1},
  (_, i) => i * TIMELINE_TICK_STEP,
);

// "Today" marker, as a day offset on the same scale.
const PROJECT_DAY = 58;

// ============= DATA =============

// Task backlog by status. Tasks are not equally sized, so the fixture makes
// count and effort diverge deliberately; points sum to the 320 the burndown
// starts from. Statuses are categories rather than a scale, so the fills come
// from the categorical palette, reusing the Gantt's anchors so one status means
// one color everywhere on the page.
const TASK_STATUS: TaskStatusSegment[] = [
  {
    key: 'closed',
    label: 'Closed',
    tasks: 86,
    points: 190,
    color: 'var(--color-data-categorical-blue, #0171E3)',
  },
  {
    key: 'inProgress',
    label: 'In progress',
    tasks: 24,
    points: 58,
    color: 'var(--color-data-categorical-green, #0B991F)',
  },
  {
    key: 'inReview',
    label: 'In review',
    tasks: 12,
    points: 24,
    color: 'var(--color-data-categorical-orange, #EB6E00)',
  },
  {
    key: 'blocked',
    label: 'Blocked',
    tasks: 5,
    points: 22,
    color: 'var(--color-data-categorical-red, #F5394F)',
  },
  {
    key: 'planned',
    label: 'Planned',
    tasks: 21,
    points: 26,
    color: CHART_NEUTRAL,
  },
];

const MILESTONES: Milestone[] = [
  {
    id: 'm1',
    name: 'Kickoff & scoping',
    phase: 'build',
    start: 0,
    end: 8,
    status: 'onTrack',
    dateLabel: 'Apr 1 – Apr 9',
  },
  {
    id: 'm2',
    name: 'Architecture sign-off',
    phase: 'build',
    start: 8,
    end: 20,
    status: 'onTrack',
    dateLabel: 'Apr 9 – Apr 21',
  },
  {
    id: 'm3',
    name: 'Feature complete',
    phase: 'build',
    start: 20,
    end: 44,
    status: 'atRisk',
    dateLabel: 'Apr 21 – May 15',
  },
  {
    id: 'm4',
    name: 'Private beta',
    phase: 'beta',
    start: 44,
    end: 62,
    status: 'atRisk',
    dateLabel: 'May 15 – Jun 2',
  },
  {
    id: 'm5',
    name: 'Bug bash & hardening',
    phase: 'beta',
    start: 58,
    end: 72,
    status: 'blocked',
    dateLabel: 'May 29 – Jun 12',
  },
  {
    id: 'm6',
    name: 'GA readiness review',
    phase: 'ga',
    start: 72,
    end: 82,
    status: 'onTrack',
    dateLabel: 'Jun 12 – Jun 22',
  },
  {
    id: 'm7',
    name: 'Public launch',
    phase: 'ga',
    start: 82,
    end: 90,
    status: 'onTrack',
    dateLabel: 'Jun 22 – Jun 30',
  },
];

const WORKSTREAMS: Workstream[] = [
  {
    id: 'w1',
    name: 'Core platform',
    owner: 'Priya Raman',
    phase: 'build',
    percent: 100,
    due: '2026-04-21',
    status: 'onTrack',
  },
  {
    id: 'w2',
    name: 'Data pipeline',
    owner: 'Marcus Webb',
    phase: 'build',
    percent: 92,
    due: '2026-05-15',
    status: 'atRisk',
  },
  {
    id: 'w3',
    name: 'Web client',
    owner: 'Ana Duarte',
    phase: 'build',
    percent: 88,
    due: '2026-05-15',
    status: 'onTrack',
  },
  {
    id: 'w4',
    name: 'Beta onboarding',
    owner: 'Tom Okafor',
    phase: 'beta',
    percent: 64,
    due: '2026-06-02',
    status: 'atRisk',
  },
  {
    id: 'w5',
    name: 'Load & reliability',
    owner: 'Dana Whitfield',
    phase: 'beta',
    percent: 38,
    due: '2026-06-12',
    status: 'blocked',
  },
  {
    id: 'w6',
    name: 'Docs & enablement',
    owner: 'Sofia Marín',
    phase: 'ga',
    percent: 55,
    due: '2026-06-22',
    status: 'onTrack',
  },
  {
    id: 'w7',
    name: 'Launch marketing',
    owner: 'Kenji Watanabe',
    phase: 'ga',
    percent: 41,
    due: '2026-06-22',
    status: 'onTrack',
  },
  {
    id: 'w8',
    name: 'Go-to-market ops',
    owner: 'Lena Fischer',
    phase: 'ga',
    percent: 30,
    due: '2026-06-30',
    status: 'atRisk',
  },
];

const RISKS: Risk[] = [
  {
    id: 'r1',
    title: 'Load tests failing at 3x target concurrency',
    workstream: 'Load & reliability',
    phase: 'beta',
    severity: 'blocked',
    owner: 'Dana Whitfield',
    detail:
      'p99 latency degrades past SLO above 12k concurrent sessions. Root cause traced to connection-pool saturation; fix depends on the data-pipeline retry change landing first.',
  },
  {
    id: 'r2',
    title: 'Data pipeline backfill slower than planned',
    workstream: 'Data pipeline',
    phase: 'build',
    severity: 'atRisk',
    owner: 'Marcus Webb',
    detail:
      'Historical backfill is tracking two days behind. Mitigation: parallelizing the backfill workers; feature-complete date at risk if not recovered this week.',
  },
  {
    id: 'r3',
    title: 'Beta onboarding email deliverability',
    workstream: 'Beta onboarding',
    phase: 'beta',
    severity: 'atRisk',
    owner: 'Tom Okafor',
    detail:
      'Invite emails landing in spam for two enterprise domains. Working with IT to allowlist sending IPs before the private beta opens.',
  },
];

// Ideal vs. actual remaining scope (story points), one entry per week. Actual
// trails ideal mid-project (scope discovery), then recovers late.
const BURNDOWN = (() => {
  const total = 320;
  const actualRemaining = [
    320, 300, 286, 262, 240, 226, 210, 182, 150, 132, 96, 54, 20,
  ];
  const idealStep = total / (actualRemaining.length - 1);
  return actualRemaining.map((actual, i) => ({
    week: i,
    label: `W${i + 1}`,
    ideal: Math.max(0, Math.round(total - idealStep * i)),
    actual,
  }));
})();

const BURNDOWN_TICKS = [0, 3, 6, 9, 12];

// ============= DERIVED FROM DATA =============

// Program-wide aggregates: unaffected by the phase filter, so computed once.
const TASK_POINTS_TOTAL = TASK_STATUS.reduce((sum, s) => sum + s.points, 0);
const TASK_COUNT_TOTAL = TASK_STATUS.reduce((sum, s) => sum + s.tasks, 0);

// Worst status across every workstream wins.
const PROGRAM_STATUS: Rag = WORKSTREAMS.some(w => w.status === 'blocked')
  ? 'blocked'
  : WORKSTREAMS.some(w => w.status === 'atRisk')
    ? 'atRisk'
    : 'onTrack';

function byPhase<T extends {phase: ReleasePhase}>(
  items: T[],
  phase: Phase,
): T[] {
  return phase === 'all' ? items : items.filter(item => item.phase === phase);
}

// ============= DONUT GEOMETRY =============

const DONUT_SIZE = 208;
const DONUT_OUTER_RADIUS = 104;
const DONUT_INNER_RADIUS = 70;

// The standard 2px gap between touching marks, which Recharts wants as an
// angle: 2px of arc at the middle of the ring.
const DONUT_GAP_ANGLE =
  (2 / ((DONUT_OUTER_RADIUS + DONUT_INNER_RADIUS) / 2)) * (180 / Math.PI);

// ============= SHARED PIECES =============

const pageStyles = stylex.create({
  contentBottomPad: {
    paddingBlockEnd: 'var(--spacing-10)',
  },
  // The header and each Section run full-bleed so their dividers reach the
  // viewport edges; the column inside them is what gets capped and centered.
  contentColumn: {
    width: '100%',
    maxWidth: 1440,
    marginInline: 'auto',
  },
  // Risk rows carry no action, so ListItem's interactive treatment (pointer
  // cursor, pressed state) would be a lie. This is the hover half only — a hint
  // that the hover card exists — guarded so it never sticks on touch.
  riskRow: {
    transitionProperty: 'background-color',
    transitionDuration: 'var(--duration-fast-min)',
    transitionTimingFunction: 'var(--ease-standard)',
    backgroundColor: 'transparent',
    ':hover': {
      backgroundColor: {
        default: null,
        '@media (hover: hover)': 'var(--color-overlay-hover)',
      },
    },
  },
  // Rows run the full width of the card, so the hover card has to cap itself.
  riskDetail: {
    maxWidth: 320,
  },
  // Fixed frame so the ring's px radii stay exact.
  donutFrame: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    flexShrink: 0,
  },
});

// Icon's `color` prop takes semantic names only, but a legend swatch has to
// match its series color exactly, so this one reaches for an inline color.
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

// Card titles are visually level 3 but sit at level 2 in the outline, as peers
// of the section headings. `hint` describes the card, `meta` is the count or
// figure that trails on the opposite edge.
function CardHeading({
  title,
  hint,
  meta,
}: {
  title: string;
  hint?: string;
  meta?: string;
}) {
  return (
    <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
      <VStack>
        <Heading level={3} accessibilityLevel={2}>
          {title}
        </Heading>
        {hint ? (
          <Text type="supporting" color="secondary">
            {hint}
          </Text>
        ) : null}
      </VStack>
      {meta ? (
        <Text type="body" color="secondary">
          {meta}
        </Text>
      ) : null}
    </HStack>
  );
}

function PhaseEmptyState({noun}: {noun: string}) {
  return (
    <EmptyState
      title={`No ${noun} in this phase`}
      description={`Switch phases to see other ${noun}.`}
      icon={<Icon icon={FlagIcon} size="lg" />}
      isCompact
    />
  );
}

// ============= PAGE HEADER =============

function ProgramHeader({
  phase,
  onPhaseChange,
}: {
  phase: Phase;
  onPhaseChange: (phase: Phase) => void;
}) {
  return (
    <LayoutHeader padding={6} hasDivider>
      <HStack
        gap={3}
        vAlign="center"
        hAlign="between"
        wrap="wrap"
        xstyle={pageStyles.contentColumn}>
        <VStack gap={1}>
          <Heading level={1}>Aurora Launch</Heading>
          <HStack gap={2} vAlign="center">
            <Text type="body" color="secondary">
              Target GA ·
            </Text>
            <Timestamp
              value="2026-06-30T00:00:00Z"
              format="date"
              type="body"
              color="secondary"
            />
            <Badge
              variant={RAG_BADGE[PROGRAM_STATUS]}
              label={RAG_LABEL[PROGRAM_STATUS]}
              icon={<Icon icon={RAG_ICON[PROGRAM_STATUS]} size="sm" />}
            />
          </HStack>
        </VStack>
        <HStack gap={2}>
          <SegmentedControl
            label="Release phase"
            value={phase}
            onChange={value => onPhaseChange(value as Phase)}>
            <SegmentedControlItem label="All" value="all" />
            <SegmentedControlItem label="Build" value="build" />
            <SegmentedControlItem label="Beta" value="beta" />
            <SegmentedControlItem label="GA" value="ga" />
          </SegmentedControl>
          <Button
            label="Export status"
            variant="secondary"
            icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
          />
        </HStack>
      </HStack>
    </LayoutHeader>
  );
}

// ============= GANTT (milestone timeline) =============

const GANTT_MIN_HEIGHT = 160;
const GANTT_ROW_HEIGHT = 44;

interface GanttTooltipEntry {
  payload: Milestone & {offset: number; duration: number};
}

function GanttTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: GanttTooltipEntry[];
}) {
  if (!active || !payload?.length) {
    return null;
  }
  // The colored duration segment is stacked last, so it carries the milestone.
  const milestone = payload[payload.length - 1].payload;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="body" weight="semibold">
          {milestone.name}
        </Text>
        <Text type="supporting" color="secondary">
          {milestone.dateLabel} · {PHASE_LABEL[milestone.phase]}
        </Text>
      </VStack>
    </Card>
  );
}

function GanttChart({milestones}: {milestones: Milestone[]}) {
  // Recharts renders a floating bar as a transparent offset segment plus a
  // colored duration segment stacked on top.
  const data = milestones.map(m => ({
    ...m,
    offset: m.start,
    duration: m.end - m.start,
  }));
  const height = Math.max(GANTT_MIN_HEIGHT, data.length * GANTT_ROW_HEIGHT);

  return (
    <VStack gap={3}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{top: 4, right: 16, left: 8, bottom: 4}}
          barCategoryGap={12}>
          <CartesianGrid horizontal={false} vertical stroke={CHART_GRID} />
          <XAxis
            type="number"
            domain={[0, TIMELINE_DAYS]}
            ticks={TIMELINE_TICKS}
            tickFormatter={(v: number) => `D${v}`}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={148}
          />
          <Tooltip content={<GanttTooltip />} cursor={{fill: CHART_GRID}} />
          {/* An annotation rather than a series, so it takes the neutral tone
              instead of a categorical color. */}
          <ReferenceLine
            x={PROJECT_DAY}
            stroke={CHART_NEUTRAL}
            strokeDasharray="4 4"
            label={{
              value: 'Today',
              position: 'top',
              fontSize: 11,
              fill: CHART_NEUTRAL,
            }}
          />
          <Bar
            dataKey="offset"
            stackId="gantt"
            fill="transparent"
            isAnimationActive={false}
          />
          <Bar
            dataKey="duration"
            stackId="gantt"
            radius={4}
            isAnimationActive={false}>
            {data.map(m => (
              <Cell key={m.id} fill={RAG_FILL[m.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <HStack gap={4} vAlign="center" wrap="wrap">
        <LegendDot color={RAG_FILL.onTrack} label={RAG_LABEL.onTrack} />
        <LegendDot color={RAG_FILL.atRisk} label={RAG_LABEL.atRisk} />
        <LegendDot color={RAG_FILL.blocked} label={RAG_LABEL.blocked} />
      </HStack>
    </VStack>
  );
}

// ============= TASK PROGRESS (weighted donut) =============

function percentOfPoints(points: number): number {
  return Math.round((points / TASK_POINTS_TOTAL) * 100);
}

interface DonutTooltipEntry {
  payload: TaskStatusSegment;
}

function TaskDonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: DonutTooltipEntry[];
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const segment = payload[0].payload;
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <LegendDot color={segment.color} label={segment.label} />
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {percentOfPoints(segment.points)}% · {segment.points} pts ·{' '}
          {segment.tasks} tasks
        </Text>
      </VStack>
    </Card>
  );
}

function TaskProgressDonut() {
  return (
    <HStack gap={8} vAlign="center" wrap="wrap">
      {/* Fixed size rather than a ResponsiveContainer: the ring geometry is
          deliberate, and the card wraps the legend under it rather than
          shrinking it. */}
      <div {...stylex.props(pageStyles.donutFrame)}>
        <PieChart
          width={DONUT_SIZE}
          height={DONUT_SIZE}
          margin={{top: 0, right: 0, bottom: 0, left: 0}}>
          <Pie
            data={TASK_STATUS}
            dataKey="points"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={DONUT_INNER_RADIUS}
            outerRadius={DONUT_OUTER_RADIUS}
            paddingAngle={DONUT_GAP_ANGLE}
            // Noon start, running clockwise, which puts "Closed" at the top.
            startAngle={90}
            endAngle={-270}
            // The gap separates the arcs; a stroke would add non-data ink.
            stroke="none"
            isAnimationActive={false}>
            {TASK_STATUS.map(s => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip content={<TaskDonutTooltip />} />
        </PieChart>
      </div>
      {/* A key, not a table: per-segment figures live in the tooltip. */}
      <VStack gap={2}>
        {TASK_STATUS.map(s => (
          <LegendDot key={s.key} color={s.color} label={s.label} />
        ))}
      </VStack>
    </HStack>
  );
}

// ============= BURN-DOWN CHART =============

interface BurndownTooltipEntry {
  name: string;
  value: number;
  color: string;
}

function BurndownTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: BurndownTooltipEntry[];
  label?: number;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const week = typeof label === 'number' ? (BURNDOWN[label]?.label ?? '') : '';
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          {week}
        </Text>
        {payload.map(entry => (
          <LegendDot
            key={entry.name}
            color={entry.color}
            label={`${entry.name}: ${entry.value} pts`}
          />
        ))}
      </VStack>
    </Card>
  );
}

// Matches the donut frame so the two plots sharing the summary row read as one
// band.
const BURNDOWN_HEIGHT = DONUT_SIZE;

function BurndownChart() {
  return (
    <VStack gap={3}>
      <ResponsiveContainer width="100%" height={BURNDOWN_HEIGHT}>
        <LineChart
          data={BURNDOWN}
          margin={{top: 16, right: 4, left: 4, bottom: 4}}>
          <CartesianGrid horizontal vertical={false} stroke={CHART_GRID} />
          <XAxis
            dataKey="week"
            type="number"
            domain={[0, BURNDOWN.length - 1]}
            ticks={BURNDOWN_TICKS}
            tickFormatter={(v: number) => BURNDOWN[v]?.label ?? ''}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={40}
            unit=" pts"
          />
          <Tooltip
            content={<BurndownTooltip />}
            cursor={{stroke: CHART_GRID}}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            name="Ideal"
            stroke={IDEAL_COLOR}
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke={ACTUAL_COLOR}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <HStack gap={4} vAlign="center" wrap="wrap">
        <LegendDot color={ACTUAL_COLOR} label="Actual remaining" />
        <LegendDot color={IDEAL_COLOR} label="Ideal burndown" />
      </HStack>
    </VStack>
  );
}

// ============= RISKS LIST =============

function RiskRow({risk}: {risk: Risk}) {
  // The `<HoverCard>` wrapper is not usable here: it wraps its trigger in a
  // `display: contents` span, and a span between `<ul>` and `<li>` is invalid
  // markup that drops the row out of the list in the accessibility tree. The
  // hook puts the trigger ref straight on the `<li>` instead.
  const hoverCard = useHoverCard({
    placement: 'below',
    alignment: 'start',
    // The row is a plain `<li>` made focusable below, so leave nothing to
    // `auto` trigger detection.
    focusTrigger: 'always',
  });

  return (
    <ListItem
      ref={hoverCard.ref}
      // The row has no action of its own; this tab stop exists so the detail is
      // reachable without a pointer, and `aria-describedby` reads it out.
      tabIndex={0}
      aria-describedby={hoverCard.describedBy}
      xstyle={pageStyles.riskRow}
      label={risk.title}
      description={`${risk.workstream} · ${PHASE_LABEL[risk.phase]} · ${risk.owner}`}
      endContent={
        <>
          <Badge
            variant={RAG_BADGE[risk.severity]}
            label={RAG_LABEL[risk.severity]}
          />
          {/* Inside the row, where the popover `<span>` is valid markup and
              out of flow; a sibling of the `<li>` would not be. */}
          {hoverCard.renderHoverCard(
            <VStack gap={2} xstyle={pageStyles.riskDetail}>
              <Text type="body" weight="semibold">
                {risk.title}
              </Text>
              <Text type="supporting" color="secondary">
                {risk.detail}
              </Text>
              <HStack gap={2} vAlign="center">
                <Avatar name={risk.owner} size="sm" />
                <Text type="supporting" color="secondary">
                  {risk.owner}
                </Text>
              </HStack>
            </VStack>,
          )}
        </>
      }
    />
  );
}

function RisksPanel({risks}: {risks: Risk[]}) {
  return (
    <Card padding={6}>
      <VStack gap={4}>
        <CardHeading
          title="Blockers & risks"
          hint="Hover or focus a row for detail"
        />
        {risks.length === 0 ? (
          <EmptyState
            title="No open blockers or risks"
            description="Nothing flagged for the selected phase. Keep it up."
            icon={<Icon icon={CheckCircleIcon} size="lg" color="success" />}
            isCompact
          />
        ) : (
          <List hasDividers>
            {risks.map(risk => (
              <RiskRow key={risk.id} risk={risk} />
            ))}
          </List>
        )}
      </VStack>
    </Card>
  );
}

// ============= WORKSTREAM TABLE =============

const WORKSTREAM_COLUMNS: TableColumn<Workstream>[] = [
  {
    key: 'name',
    header: 'Workstream',
    width: proportional(1, {minWidth: 160}),
    renderCell: (item: Workstream) => (
      <VStack gap={0}>
        <Text type="body" weight="semibold">
          {item.name}
        </Text>
        <Text type="supporting" color="secondary">
          {PHASE_LABEL[item.phase]}
        </Text>
      </VStack>
    ),
  },
  {
    key: 'owner',
    header: 'Owner',
    width: proportional(1, {minWidth: 160}),
    renderCell: (item: Workstream) => (
      <HStack gap={2} vAlign="center">
        <Avatar name={item.owner} size="sm" />
        <Text type="body">{item.owner}</Text>
      </HStack>
    ),
  },
  {
    key: 'percent',
    header: '% complete',
    width: proportional(2, {minWidth: 200}),
    renderCell: (item: Workstream) => (
      <VStack gap={1}>
        <ProgressBar
          value={item.percent}
          max={100}
          label={`${item.name} progress`}
          isLabelHidden
        />
        <Text type="supporting" color="secondary">
          {item.percent}%
        </Text>
      </VStack>
    ),
  },
  {
    key: 'due',
    header: 'Due',
    width: proportional(1, {minWidth: 120}),
    renderCell: (item: Workstream) => (
      <Timestamp value={item.due} format="date" />
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: proportional(1, {minWidth: 120}),
    renderCell: (item: Workstream) => (
      <Badge variant={RAG_BADGE[item.status]} label={RAG_LABEL[item.status]} />
    ),
  },
];

// ============= MAIN =============

export default function ProjectStatusPage() {
  const [phase, setPhase] = useState<Phase>('all');

  const milestones = useMemo(() => byPhase(MILESTONES, phase), [phase]);
  const workstreams = useMemo(() => byPhase(WORKSTREAMS, phase), [phase]);
  const risks = useMemo(() => byPhase(RISKS, phase), [phase]);

  return (
    <Layout
      height="fill"
      header={<ProgramHeader phase={phase} onPhaseChange={setPhase} />}
      content={
        <LayoutContent padding={0} xstyle={pageStyles.contentBottomPad}>
          <Section padding={6} dividers={['bottom']}>
            <VStack gap={6} xstyle={pageStyles.contentColumn}>
              <SectionHeading
                title="Milestone timeline"
                hint={`Project days 0–${TIMELINE_DAYS} · dashed line marks today`}
              />
              {milestones.length === 0 ? (
                <PhaseEmptyState noun="milestones" />
              ) : (
                <GanttChart milestones={milestones} />
              )}
            </VStack>
          </Section>

          <Section padding={6} paddingBlock={10}>
            <VStack gap={6} xstyle={pageStyles.contentColumn}>
              <Grid gap={4} columns={{minWidth: 320, max: 3}}>
                <Card padding={6}>
                  <VStack gap={5}>
                    <CardHeading
                      title="Overall progress"
                      hint={`${TASK_COUNT_TOTAL} tasks · ${TASK_POINTS_TOTAL} story points`}
                    />
                    <TaskProgressDonut />
                  </VStack>
                </Card>

                <Card padding={6}>
                  <VStack gap={5}>
                    <CardHeading
                      title="Scope burndown"
                      hint={`Remaining story points · ${BURNDOWN.length} weeks`}
                    />
                    <BurndownChart />
                  </VStack>
                </Card>

                <RisksPanel risks={risks} />
              </Grid>

              <Card padding={6}>
                <VStack gap={4}>
                  <CardHeading
                    title="Workstreams"
                    meta={`${workstreams.length} of ${WORKSTREAMS.length}`}
                  />
                  {workstreams.length === 0 ? (
                    <PhaseEmptyState noun="workstreams" />
                  ) : (
                    <Table<Workstream>
                      data={workstreams}
                      columns={WORKSTREAM_COLUMNS}
                      idKey="id"
                      density="balanced"
                      dividers="rows"
                      hasHover
                    />
                  )}
                </VStack>
              </Card>
            </VStack>
          </Section>
        </LayoutContent>
      }
    />
  );
}
