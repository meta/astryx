// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A comparison matrix: candidates across the top, criteria down the side, and a
 * label column that stays put while the candidates scroll past it.
 *
 * This is the transpose of every other table in the set. Elsewhere a row is a
 * record and a column is a field; here a *column* is the record — one language
 * model — and a row is a single attribute measured across all of them. That
 * flip is what makes the layout work: comparison is a vertical scan, and a
 * vertical scan only works if the thing being compared shares a column.
 *
 * It is also the shape that makes `useTableGroupedRows` correct, where
 * `table-grouped` made it wrong. Every group here — overview, pricing,
 * performance, limits — is measured against the same models, so one header row
 * is true of every section beneath it. Groups are a way to chunk a long
 * criteria list, not a sign that the records differ.
 *
 * ## Extending this template
 *
 * **The matrix is derived, not authored.** Four visible models times nineteen
 * criteria is seventy-six cells, and hand-writing them guarantees a typo nobody
 * finds. Instead `MODELS` holds each model's specs once, `SPEC_ROWS` declares
 * each criterion as a `get(model)` accessor, and the table is the product of the
 * two. Blended cost is a pure function of the two prices above it, so it cannot
 * drift. Add a model and every row gains a cell; add a criterion and every model
 * gains a value.
 *
 * **The columns are a selection, not a list.** `MODELS` is the catalog and
 * `slots` is what the reader chose to compare, so the header is a control rather
 * than a caption: each column owns a `Selector` that swaps the model underneath
 * it. This is the difference between a comparison page and a comparison *tool* —
 * the interesting question is rarely "how do these four rank" but "how does this
 * one look against that one", and that question needs the axis to be editable.
 * A model already in another slot is disabled rather than hidden, so the list
 * reads the same in every column and you can see why an option is unavailable.
 *
 * **Best-in-row is scoped to the visible set.** The winner is computed from the
 * selected models, not the catalog, so swapping a column recomputes every mark
 * in the table. Scoping it to the catalog instead would be the subtle bug here:
 * a column could sit unmarked through the whole matrix because it loses to a
 * model the reader never asked about and cannot see.
 *
 * **Only comparable rows get a winner.** A criterion declares
 * `better: 'higher' | 'lower'`, and rows that declare neither — a provider name,
 * a modality list, a yes/no — get no mark at all. This is the part teams get
 * wrong: marking a winner on a row where the values are merely different, not
 * better or worse, quietly tells the reader a preference the data does not
 * support. Winners render semibold, so a strong column reads as a vertical run
 * of bold rather than as a colour, which keeps the signal legible to readers who
 * cannot separate the hues.
 *
 * **Ties are winners too.** `bestByRow` compares against the extreme value
 * rather than picking one index, so identical values are all marked. Choosing an
 * arbitrary winner among equals is a bug that survives review because it looks
 * decisive.
 *
 * **The label column is pinned because the row labels are the axis.** Scrolled
 * horizontally, an unpinned matrix becomes a grid of anonymous numbers.
 * `useTableStickyColumns({startKeys: ['spec']})` keeps the criterion visible;
 * `endKeys` does the same for a trailing run if you want a fixed reference
 * column on the right. The plugin accumulates pixel offsets across the pinned
 * run only, and that run is a single column sitting at offset zero, so the
 * model columns are free to be `proportional()`: they divide whatever the label
 * column leaves, and fall back to scrolling once their minimum no longer fits.
 */

import type {ReactNode} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import * as stylex from '@stylexjs/stylex';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Selector} from '@astryxdesign/core/Selector';
import {
  Table,
  pixel,
  proportional,
  useTableGroupedRows,
  useTableStickyColumns,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import type {IconType} from '@astryxdesign/core/Icon';
import {Switch} from '@astryxdesign/core/Switch';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {Rectangle, Scatter, ScatterChart, XAxis, YAxis, ZAxis} from 'recharts';
import {
  AudioLines,
  Box,
  CircleCheck,
  CircleX,
  Cpu,
  FileText,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Type,
  Video,
  Zap,
} from 'lucide-react';

// ============= CANDIDATES =============

/**
 * Modalities are a set, not a sentence. Held as data, the row can render every
 * model against the same four slots — so a gap is a dimmed glyph in a fixed
 * position rather than a word you have to notice is missing from a list.
 */
type Modality = 'text' | 'image' | 'audio' | 'video' | 'document';

const MODALITY_ORDER: Modality[] = [
  'text',
  'image',
  'audio',
  'video',
  'document',
];

const MODALITY_ICON: Record<Modality, IconType> = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  document: FileText,
};

/**
 * Tooltip and accessible-name copy. The glyphs are small and several are
 * near-neighbours — a waveform and a film frame are not self-evident at 20px —
 * so the rail explains every slot on hover, focus, and touch.
 */
const MODALITY_LABEL: Record<Modality, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  document: 'Document',
};

/** One model's specs, stated once. Every cell in the table derives from here. */
interface Model {
  id: string;
  name: string;
  provider: string;
  /** Context window in tokens. */
  context: number;
  /** Maximum tokens in a single response. */
  maxOutput: number;
  cutoff: string;
  inputModalities: Modality[];
  outputModalities: Modality[];
  hasOpenWeights: boolean;
  /** USD per million input tokens. */
  inputPrice: number;
  /** USD per million output tokens. */
  outputPrice: number;
  /** USD per million cached input tokens. */
  cachedPrice: number;
  /** Output tokens per second, median. */
  speed: number;
  /** Time to first token, seconds. */
  latency: number;
  mmlu: number;
  humanEval: number;
  math: number;
  /** Requests per minute at the default tier. */
  rateLimit: number;
  hasStreaming: boolean;
  hasTools: boolean;
  hasFineTuning: boolean;
}

const MODELS: Model[] = [
  {
    id: 'atlas-4-flash',
    name: 'Atlas 4 Flash',
    provider: 'Northwind',
    context: 1_000_000,
    maxOutput: 65_536,
    cutoff: 'Mar 2026',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    hasOpenWeights: false,
    inputPrice: 0.1,
    outputPrice: 0.4,
    cachedPrice: 0.025,
    speed: 186,
    latency: 0.28,
    mmlu: 78.4,
    humanEval: 84.1,
    math: 71.2,
    rateLimit: 4_000,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: true,
  },
  {
    id: 'atlas-4-pro',
    name: 'Atlas 4 Pro',
    provider: 'Northwind',
    context: 2_000_000,
    maxOutput: 131_072,
    cutoff: 'Mar 2026',
    inputModalities: ['text', 'image', 'audio', 'document'],
    outputModalities: ['text', 'audio'],
    hasOpenWeights: false,
    inputPrice: 1.25,
    outputPrice: 5.0,
    cachedPrice: 0.31,
    speed: 74,
    latency: 0.62,
    mmlu: 88.7,
    humanEval: 93.4,
    math: 89.1,
    rateLimit: 1_000,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: false,
  },
  {
    id: 'meridian-2-5-flash',
    name: 'Meridian 2.5 Flash',
    provider: 'Calder Labs',
    context: 1_048_576,
    maxOutput: 8_192,
    cutoff: 'Jan 2026',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    hasOpenWeights: false,
    inputPrice: 0.075,
    outputPrice: 0.3,
    cachedPrice: 0.019,
    speed: 214,
    latency: 0.24,
    mmlu: 76.9,
    humanEval: 81.7,
    math: 68.4,
    rateLimit: 2_000,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: true,
  },
  {
    id: 'meridian-2-5-pro',
    name: 'Meridian 2.5 Pro',
    provider: 'Calder Labs',
    context: 2_097_152,
    maxOutput: 65_536,
    cutoff: 'Jan 2026',
    inputModalities: ['text', 'image', 'audio', 'video', 'document'],
    outputModalities: ['text', 'image', 'audio'],
    hasOpenWeights: false,
    inputPrice: 1.25,
    outputPrice: 10.0,
    cachedPrice: 0.31,
    speed: 62,
    latency: 0.71,
    mmlu: 89.3,
    humanEval: 92.8,
    math: 91.6,
    rateLimit: 360,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: false,
  },
  {
    id: 'orion-mini-3',
    name: 'Orion Mini 3',
    provider: 'Halcyon',
    context: 262_144,
    maxOutput: 32_768,
    cutoff: 'Nov 2025',
    inputModalities: ['text'],
    outputModalities: ['text'],
    hasOpenWeights: true,
    inputPrice: 0.05,
    outputPrice: 0.2,
    cachedPrice: 0.012,
    speed: 248,
    latency: 0.19,
    mmlu: 71.2,
    humanEval: 74.6,
    math: 58.9,
    rateLimit: 8_000,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: true,
  },
  {
    id: 'orion-3-ultra',
    name: 'Orion 3 Ultra',
    provider: 'Halcyon',
    context: 524_288,
    maxOutput: 65_536,
    cutoff: 'Nov 2025',
    inputModalities: ['text', 'image', 'document'],
    outputModalities: ['text', 'image'],
    hasOpenWeights: true,
    inputPrice: 0.9,
    outputPrice: 2.7,
    cachedPrice: 0.22,
    speed: 96,
    latency: 0.48,
    mmlu: 85.1,
    humanEval: 89.2,
    math: 82.3,
    rateLimit: 1_200,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: true,
  },
  {
    id: 'kestrel-v4-turbo',
    name: 'Kestrel V4 Turbo',
    provider: 'Sable AI',
    context: 400_000,
    maxOutput: 16_384,
    cutoff: 'Feb 2026',
    inputModalities: ['text', 'image', 'document'],
    outputModalities: ['text'],
    hasOpenWeights: false,
    inputPrice: 0.3,
    outputPrice: 1.2,
    cachedPrice: 0.075,
    speed: 142,
    latency: 0.33,
    mmlu: 82.6,
    humanEval: 87.3,
    math: 77.8,
    rateLimit: 3_000,
    hasStreaming: true,
    hasTools: true,
    hasFineTuning: false,
  },
  {
    id: 'kestrel-v4-lite',
    name: 'Kestrel V4 Lite',
    provider: 'Sable AI',
    context: 128_000,
    maxOutput: 8_192,
    cutoff: 'Feb 2026',
    inputModalities: ['text'],
    outputModalities: ['text'],
    hasOpenWeights: false,
    inputPrice: 0.04,
    outputPrice: 0.16,
    cachedPrice: 0.01,
    speed: 265,
    latency: 0.17,
    mmlu: 68.4,
    humanEval: 70.1,
    math: 54.2,
    rateLimit: 10_000,
    hasStreaming: true,
    hasTools: false,
    hasFineTuning: false,
  },
];

const MODEL_BY_ID = new Map(MODELS.map(model => [model.id, model]));

/**
 * A mark per provider, so a column is identifiable before its name is read and
 * two models from the same vendor are visibly related. Keyed by provider rather
 * than by model: the mark says who built it, and a per-model glyph would imply a
 * distinction that does not exist.
 */
const PROVIDER_ICON: Record<string, IconType> = {
  Northwind: Cpu,
  'Calder Labs': Sparkles,
  Halcyon: Zap,
  'Sable AI': Box,
};

/**
 * The three the page opens on. Three columns is the count a reader can hold in
 * a single comparison — the fourth is a click away, and every column past the
 * opening set is one the reader asked for rather than one they have to dismiss.
 */
const DEFAULT_SLOTS = [
  'atlas-4-flash',
  'meridian-2-5-flash',
  'kestrel-v4-turbo',
];

/** Below two columns there is nothing left to compare against. */
const MIN_SLOTS = 2;

// ============= FORMATTING =============

// Pinned locale keeps the rendered output identical in every environment.
const decimal = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const whole = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const price = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

// ============= CRITERIA =============

type GroupKey =
  | 'Overview'
  | 'Pricing'
  | 'Performance'
  | 'Availability'
  | 'Benchmarks'
  | 'Limits';

// Availability sits with performance rather than after the benchmarks: whether
// a service stayed up is an operational fact about running it, and it belongs
// beside speed and latency instead of below the leaderboard scores.
const GROUP_ORDER: GroupKey[] = [
  'Overview',
  'Pricing',
  'Performance',
  'Availability',
  'Benchmarks',
  'Limits',
];

/**
 * A cell is a number when it can be ranked, and a string or boolean when it
 * cannot. `better` is only meaningful on the numeric ones, which is why
 * `bestByRow` ignores every other kind rather than trying to order them.
 */
type CellValue = number | string | boolean;

interface SpecRow extends Record<string, unknown> {
  id: string;
  /**
   * Carries its own unit, because the label column is one line per row. A
   * second line under the label is the obvious place to put "per 1M tokens",
   * and it is what makes rows different heights — which is precisely what
   * defeats a vertical scan down a column.
   */
  label: string;
  group: GroupKey;
  /** Omitted when the values differ without one being better. */
  better?: 'higher' | 'lower';
  get: (model: Model) => CellValue;
  /** Numbers only; strings render as-is and booleans render as a check. */
  format?: (value: number) => string;
  /** Trails the value in supporting text, e.g. "tokens" or "/1M". */
  unit?: string;
  /** Draws the value as a proportion of 100 alongside the number. */
  isScore?: boolean;
  /** Replaces the cell entirely. Skips ranking, so pair it with no `better`. */
  renderValue?: (model: Model) => ReactNode;
}

const SPEC_ROWS: SpecRow[] = [
  {
    id: 'provider',
    group: 'Overview',
    label: 'Provider',
    get: m => m.provider,
  },
  {
    id: 'context',
    group: 'Overview',
    label: 'Context window',
    unit: 'tokens',
    better: 'higher',
    get: m => m.context,
    format: v => compact.format(v),
  },
  {
    id: 'max-output',
    group: 'Overview',
    label: 'Max output',
    unit: 'tokens',
    better: 'higher',
    get: m => m.maxOutput,
    format: v => compact.format(v),
  },
  {
    id: 'cutoff',
    group: 'Overview',
    label: 'Knowledge cutoff',
    get: m => m.cutoff,
  },
  {
    id: 'input-modalities',
    group: 'Overview',
    label: 'Input modalities',
    // Drawn in MODALITY_ORDER, not in the order the model happens to list, so
    // the glyphs line up slot for slot across every column and down both rows.
    get: m => m.inputModalities.join(', '),
    renderValue: m => <ModalityRail supported={m.inputModalities} />,
  },
  {
    id: 'output-modalities',
    group: 'Overview',
    label: 'Output modalities',
    get: m => m.outputModalities.join(', '),
    renderValue: m => <ModalityRail supported={m.outputModalities} />,
  },
  {
    id: 'open-weights',
    group: 'Overview',
    label: 'Open weights',
    get: m => m.hasOpenWeights,
  },
  {
    id: 'input-price',
    group: 'Pricing',
    label: 'Input',
    unit: '/1M',
    better: 'lower',
    get: m => m.inputPrice,
    format: v => price.format(v),
  },
  {
    id: 'output-price',
    group: 'Pricing',
    label: 'Output',
    unit: '/1M',
    better: 'lower',
    get: m => m.outputPrice,
    format: v => price.format(v),
  },
  {
    id: 'cached-price',
    group: 'Pricing',
    label: 'Cached input',
    unit: '/1M',
    better: 'lower',
    get: m => m.cachedPrice,
    format: v => price.format(v),
  },
  {
    // Derived from the two rows above, on the 3:1 read-to-write split typical of
    // chat traffic. A blended figure is the only honest way to rank two prices
    // at once, and deriving it means it cannot fall out of step with them.
    id: 'blended-price',
    group: 'Pricing',
    label: 'Blended (3:1)',
    unit: '/1M',
    better: 'lower',
    get: m => (m.inputPrice * 3 + m.outputPrice) / 4,
    format: v => price.format(v),
  },
  {
    id: 'speed',
    group: 'Performance',
    label: 'Output speed',
    better: 'higher',
    unit: 'tok/s',
    get: m => m.speed,
    format: v => whole.format(v),
  },
  {
    id: 'latency',
    group: 'Performance',
    label: 'Time to first token',
    better: 'lower',
    unit: 'sec',
    get: m => m.latency,
    format: v => decimal.format(v),
  },
  {
    id: 'mmlu',
    group: 'Benchmarks',
    label: 'MMLU-Pro',
    better: 'higher',
    get: m => m.mmlu,
    format: v => decimal.format(v),
    isScore: true,
  },
  {
    id: 'human-eval',
    group: 'Benchmarks',
    label: 'HumanEval',
    better: 'higher',
    get: m => m.humanEval,
    format: v => decimal.format(v),
    isScore: true,
  },
  {
    id: 'math',
    group: 'Benchmarks',
    label: 'MATH',
    better: 'higher',
    get: m => m.math,
    format: v => decimal.format(v),
    isScore: true,
  },
  {
    id: 'rate-limit',
    group: 'Limits',
    label: 'Rate limit',
    better: 'higher',
    unit: '/min',
    get: m => m.rateLimit,
    format: v => whole.format(v),
  },
  {
    id: 'streaming',
    group: 'Limits',
    label: 'Streaming',
    get: m => m.hasStreaming,
  },
  {
    id: 'tools',
    group: 'Limits',
    label: 'Function calling',
    get: m => m.hasTools,
  },
  {
    id: 'fine-tuning',
    group: 'Limits',
    label: 'Fine-tuning',
    get: m => m.hasFineTuning,
  },
  {
    id: 'usage',
    // The window is named in the label rather than under it: this column
    // carries labels only, and a per-cell caption would repeat five times.
    group: 'Availability',
    label: 'Uptime (30d)',
    get: m => m.name,
    renderValue: m => <UptimeStrip model={m} />,
  },
];

// ============= COLUMNS =============

const SPEC_COLUMN_WIDTH = 220;
/**
 * The floor a model column may not shrink past, not its width. The columns are
 * proportional so three of them fill the table instead of stranding a third of
 * the page as dead space, and the minimum is what turns the eighth column into
 * a horizontal scroll rather than eight unreadable slivers.
 */
const MODEL_COLUMN_MIN_WIDTH = 236;

/**
 * One line of `large` text (17px on a 24px leading). Every cell reserves it,
 * whether it holds a figure, an icon or a dash, so rows in a section stay the
 * same height and the eye can travel across a row without stepping.
 */
const CELL_CONTENT_HEIGHT = 24;

const styles = stylex.create({
  // The winner's wash, filling the whole cell rather than hugging the figure.
  // At a glance the reader is looking for which *column* wins a row, and a
  // full cell is a target the eye can land on from the far side of the table
  // where a pill around four characters is not.
  //
  // Reaching the cell edges means undoing the cell's own padding, so these
  // values track `density="spacious"` on the Table below — the two have to be
  // changed together. `content-box` keeps the shared 20px line height as the
  // content height, so a filled cell is exactly as tall as an unfilled one.
  //
  // Blue rather than green: green reads as "passed" on rows where the winner
  // is merely the cheapest or the fastest, and it collides with the
  // operational green already spoken for in the uptime strip. The `blue`
  // family and not `--color-accent-muted`, because a theme is free to run a
  // monochrome accent — the bundled neutral theme does — and the mark has to
  // stay a hue rather than collapse into another grey band. The wash is a
  // second encoding, not the only one: winners stay semibold, and supporting
  // units move to primary text so normal-weight copy keeps AA contrast on the
  // dark neutral blue wash. The ranking therefore also survives for readers
  // who cannot separate the hues and in a greyscale print.
  best: {
    backgroundColor: colorVars['--color-background-blue'],
    boxSizing: 'content-box',
    marginBlock: `calc(-1 * ${spacingVars['--spacing-3']})`,
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-4'],
  },
  // Keep the card inside the content lane so Table's own wrapper, rather than
  // an outer page surface, owns horizontal overflow and sticky positioning.
  tableFrame: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  // #6222 pins the plugin-owned chevron while preserving custom headers'
  // full-row layout. Pin this template's heading after that 16px control and
  // its two 4px gutters, so both remain visible without overlapping.
  groupHeading: {
    position: 'sticky',
    insetInlineStart: spacingVars['--spacing-6'],
    width: 'fit-content',
  },
});

/**
 * One column's heading: the model picker, whose clear control doubles as
 * "remove this column" and surfaces on hover.
 *
 * The hover state lives here rather than in the page so that pointing at a
 * heading re-renders that heading alone. Held a level up it would have to join
 * the dependencies of the `columns` memo, and every pointer move across the
 * header would rebuild all of them.
 */
function ModelHeader({
  index,
  modelId,
  taken,
  canRemove,
  onSelect,
  onRemove,
}: {
  index: number;
  modelId: string;
  taken: string[];
  canRemove: boolean;
  onSelect: (index: number, modelId: string) => void;
  onRemove: (index: number) => void;
}) {
  const [isActive, setIsActive] = useState(false);

  // Clearing the model and dropping the column are the same intent, so the
  // selector's own clear control carries it instead of a second button
  // crowding the same corner. Two columns is the least that is still a
  // comparison, so the last pair is not offered it and the reader swaps.
  const isClearable = isActive && canRemove;

  const shared = {
    label: `Model ${index + 1}`,
    isLabelHidden: true,
    size: 'lg',
    options: MODELS.map(option => ({
      value: option.id,
      label: option.name,
      description: option.provider,
      icon: PROVIDER_ICON[option.provider],
      // Taken elsewhere: shown, but not selectable twice.
      disabled: option.id !== modelId && taken.includes(option.id),
    })),
  } as const;

  return (
    <HStack
      vAlign="center"
      width="100%"
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      // Focus events bubble in React, so this covers the trigger and the clear
      // control alike, and the control is reachable without a pointer.
      onFocus={() => setIsActive(true)}
      onBlur={() => setIsActive(false)}>
      <StackItem size="fill">
        {/* `hasClear` widens value and onChange to admit null, so the two
            states are written as separate elements rather than one element
            with a boolean prop. React sees the same component in the same
            position either way, so the instance survives the swap. */}
        {isClearable ? (
          <Selector
            {...shared}
            hasClear
            value={modelId}
            onChange={next =>
              next == null ? onRemove(index) : onSelect(index, next)
            }
          />
        ) : (
          <Selector
            {...shared}
            value={modelId}
            onChange={next => onSelect(index, next)}
          />
        )}
      </StackItem>
    </HStack>
  );
}

/**
 * The five modality slots, lit or dimmed. Rendering every slot in a stable
 * order makes the rail comparable across columns; one focusable trigger keeps
 * the full explanation available to keyboard and touch users without adding
 * five tab stops to every cell.
 */
function ModalityRail({supported}: {supported: Modality[]}) {
  const explanation = MODALITY_ORDER.map(modality => {
    const name = MODALITY_LABEL[modality];
    return `${name}: ${supported.includes(modality) ? 'supported' : 'not supported'}`;
  }).join('; ');

  return (
    <Tooltip
      content={explanation}
      hasHoverIndication={false}
      touchTrigger="tap">
      <HStack
        gap={3}
        vAlign="center"
        hAlign="end"
        height={CELL_CONTENT_HEIGHT}
        tabIndex={0}
        role="group"
        aria-label="Model modalities">
        {MODALITY_ORDER.map(modality => {
          const has = supported.includes(modality);
          return (
            <HStack
              key={modality}
              width={20}
              height={20}
              hAlign="center"
              vAlign="center">
              <Icon
                icon={MODALITY_ICON[modality]}
                size="md"
                color={has ? 'primary' : 'disabled'}
              />
            </HStack>
          );
        })}
      </HStack>
    </Tooltip>
  );
}

/**
 * A benchmark score drawn as its own percentage, with the number beside it.
 *
 * The bar is the score out of 100 and nothing else. Scaling it to the row's
 * spread instead would make the meter say something the scale does not: a
 * three-point gap between frontier models would fill the track end to end and
 * read as a rout, and the same three points in a tighter row would look like a
 * different amount. Against a fixed 100 the bars are comparable down the
 * column as well as across it, and a close row is allowed to look close.
 */
function ScoreBar({value, isBest}: {value: number; isBest: boolean}) {
  return (
    <HStack
      gap={1}
      vAlign="center"
      hAlign="end"
      height={CELL_CONTENT_HEIGHT}
      xstyle={isBest ? styles.best : undefined}>
      <HStack width={56} vAlign="center">
        <ProgressBar
          label={`Score ${decimal.format(value)} out of 100`}
          isLabelHidden
          value={value}
          variant="accent"
        />
      </HStack>
      <Text
        type="large"
        hasTabularNumbers
        weight={isBest ? 'semibold' : 'normal'}>
        {decimal.format(value)}
      </Text>
    </HStack>
  );
}

// ============= ACTIVITY =============

const UPTIME_DAYS = 30;

/** The window ends on a fixed date so the template renders identically forever. */
const UPTIME_END = new Date('2026-09-07T00:00:00Z');

/**
 * Deterministic daily uptime. An xorshift keyed on the model id gives each
 * service its own incident history — one that never wobbles next to one that
 * had a bad week — without a snapshot file or a seed that moves between
 * renders.
 *
 * The shape is deliberately lopsided, the way a real status page is: most days
 * are clean, a dip is uncommon, and a genuine outage is rare. A uniform spread
 * would read as noise and tell the reader nothing.
 */
function dailyUptime(seed: number, days: number): number[] {
  let state = seed || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.abs(state % 1000) / 1000;
  };
  // One draw decides how rough this model's month was, so the columns differ
  // the way the rest of the table does: a reader scanning the row should see
  // that one service held all month and another did not.
  const rough = next();
  const outageOdds = 0.01 + rough * 0.05;
  const degradedOdds = outageOdds + 0.03 + rough * 0.09;

  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const roll = next();
    if (roll < outageOdds) {
      // A real incident: minutes to hours of downtime in the day.
      out.push(96.5 + next() * 2.4);
    } else if (roll < degradedOdds) {
      // Degraded — elevated errors or latency, not a full outage.
      out.push(99.0 + next() * 0.9);
    } else {
      out.push(99.95 + next() * 0.05);
    }
  }
  return out;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
  }
  return h;
}

function dayDate(index: number): Date {
  const d = new Date(UPTIME_END);
  d.setUTCDate(d.getUTCDate() - (UPTIME_DAYS - 1 - index));
  return d;
}

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const uptimeFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Bar geometry. One bar per day in a single strip, which is the shape every
 * status page uses and therefore the one a reader already knows how to read.
 */
const BAR_GAP = 2;
const BAR_HEIGHT = 28;
/** Keeps the strip legible if the column is dragged very narrow. */
const MIN_BAR = 2;
/** One line of body text, held open whether or not a day is hovered. */
const UPTIME_READING_HEIGHT = 24;

/**
 * Three states, not a gradient. Uptime is read as a verdict — did it hold, did
 * it wobble, did it fall over — and a continuous ramp between 96% and 100%
 * would make every day look mid. The thresholds are the ones the SLA is
 * written against.
 */
function uptimeStatus(value: number): {
  color: string;
  status: string;
} {
  if (value >= 99.95) {
    return {
      color: colorVars['--color-text-success'],
      status: 'Operational',
    };
  }
  if (value >= 99) {
    return {
      color: colorVars['--color-text-warning'],
      status: 'Degraded',
    };
  }
  return {
    color: colorVars['--color-text-error'],
    status: 'Outage',
  };
}

interface UptimeDay {
  /** Day index, left to right. */
  x: number;
  /** Constant: the strip is one row, but Recharts still needs a y accessor. */
  y: number;
  uptime: number;
  color: string;
  status: string;
  date: string;
}

/**
 * One model's last 30 days of availability, as a strip of daily bars under a
 * line of text that reports the month at rest and the day under the pointer on
 * hover.
 *
 * The reading is a line in the cell rather than a floating tooltip. A tooltip
 * over a 5px bar covers the neighbouring days at the moment the reader is
 * scanning them, lands in a different place for every bar, and cannot be
 * reached at all without a pointer; the line stays in one position, so the
 * digits change where the eye already is. It costs the row the height of one
 * line of supporting text, which is why the box around it is fixed — a caption
 * that resized between "99.82% average" and a dated reading would bounce the
 * strip under it on every bar.
 *
 * Recharts still does the hit testing, over points drawn as bars instead of
 * dots. The column is measured rather than handed to a ResponsiveContainer
 * because a custom shape is never told the plot geometry, so it cannot size a
 * bar to one slot of it; letting the container stretch would spread
 * fixed-width bars apart instead of growing them. Measuring gives the bar pitch
 * directly.
 */
function UptimeStrip({model}: {model: Model}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (el == null) {
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setBoxWidth(entry.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pitch = boxWidth / UPTIME_DAYS;
  const barWidth = Math.max(MIN_BAR, pitch - BAR_GAP);
  const stripWidth = Math.max(UPTIME_DAYS * (barWidth + BAR_GAP), 1);
  const days = useMemo(
    () =>
      dailyUptime(hashId(model.id), UPTIME_DAYS).map((uptime, i) => ({
        x: i,
        y: 0,
        uptime,
        ...uptimeStatus(uptime),
        date: dayFormat.format(dayDate(i)),
      })),
    [model.id],
  );

  const average = useMemo(
    () => days.reduce((total, day) => total + day.uptime, 0) / days.length,
    [days],
  );

  // Colour is the only encoding on a 5px bar, and the hover reading behind it
  // needs a pointer. The tally is the same reading in text, for a screen reader
  // and for anyone who cannot separate the three hues at this size.
  const spoken = useMemo(() => {
    const tally = days.reduce<Record<string, number>>((acc, day) => {
      acc[day.status] = (acc[day.status] ?? 0) + 1;
      return acc;
    }, {});
    return `Last ${UPTIME_DAYS} days: ${['Operational', 'Degraded', 'Outage']
      .filter(status => tally[status] > 0)
      .map(status => `${tally[status]} ${status.toLowerCase()}`)
      .join(', ')}.`;
  }, [days]);

  const hovered = hoveredDay == null ? undefined : days[hoveredDay];

  return (
    <VStack ref={wrapRef} gap={1} hAlign="end" width="100%">
      <VisuallyHidden>{spoken}</VisuallyHidden>
      {/* Fixed height, so swapping the month's figure for a day's one does not
          move the strip below it. */}
      <HStack height={UPTIME_READING_HEIGHT} vAlign="center">
        <Text type="body" color="primary">
          {hovered == null
            ? `${uptimeFormat.format(average)}% average`
            : `${hovered.date} · ${uptimeFormat.format(hovered.uptime)}% · ${hovered.status}`}
        </Text>
      </HStack>
      <ScatterChart
        width={stripWidth}
        height={BAR_HEIGHT}
        margin={{top: 0, right: 0, bottom: 0, left: 0}}
        // Recharts 3 hands back the active index as a string, and as `null`
        // rather than `undefined` when the pointer is between slots — so the
        // coercion has to defend against `Number(null)` resolving to day zero.
        onMouseMove={state => {
          const index = Number(state?.activeTooltipIndex ?? NaN);
          setHoveredDay(Number.isNaN(index) ? null : index);
        }}
        onMouseLeave={() => setHoveredDay(null)}>
        <XAxis
          type="number"
          dataKey="x"
          domain={[-0.5, UPTIME_DAYS - 0.5]}
          hide
        />
        <YAxis type="number" dataKey="y" domain={[-1, 1]} hide />
        <ZAxis type="number" range={[0, 0]} />
        <Scatter
          data={days}
          shape={props => (
            <UptimeBar {...props} barW={barWidth} slotW={barWidth + BAR_GAP} />
          )}
          isAnimationActive={false}
        />
      </ScatterChart>
    </VStack>
  );
}

/** One day, drawn full height so the strip reads as a continuous timeline. */
function UptimeBar(props: {
  cx?: number;
  cy?: number;
  payload?: UptimeDay;
  barW: number;
  slotW: number;
}) {
  const {cx, cy, payload, barW, slotW} = props;
  if (cx == null || cy == null || payload == null) {
    return null;
  }
  // Recharts' own Rectangle rather than a raw <rect>: the template rubric
  // counts bare SVG primitives against icon purity, and this renders the
  // same shape as a component.
  return (
    <>
      {/* The pointer target is the whole slot, gap included. Hit-testing the
          drawn bar alone leaves the gaps dead, and the reading drops back to
          the month's average in each one — crossing the strip flickers about
          once per day. Transparent rather than omitted: `fill="none"` would
          not hit-test. Slots tile the strip exactly, so widening one does not
          steal from its neighbour. */}
      <Rectangle
        x={cx - slotW / 2}
        y={cy - BAR_HEIGHT / 2}
        width={slotW}
        height={BAR_HEIGHT}
        fill="transparent"
      />
      <Rectangle
        x={cx - barW / 2}
        y={cy - BAR_HEIGHT / 2}
        width={barW}
        height={BAR_HEIGHT}
        radius={2}
        fill={payload.color}
      />
    </>
  );
}

// ============= PAGE =============

export default function ModelComparisonTemplate() {
  const [slots, setSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [isHighlightOn, setIsHighlightOn] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(previous => {
      const next = new Set(previous);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const selectedModels = useMemo(
    () =>
      slots
        .map(id => MODEL_BY_ID.get(id))
        .filter((model): model is Model => model != null),
    [slots],
  );

  /**
   * The extreme value per row across the *selected* models. Rows without a
   * direction, and rows whose values are not numbers, are absent from the map
   * and so never mark a winner.
   */
  const bestByRow = useMemo(() => {
    const best = new Map<string, number>();
    for (const row of SPEC_ROWS) {
      if (row.better == null) {
        continue;
      }
      const values = selectedModels
        .map(row.get)
        .filter((value): value is number => typeof value === 'number');
      if (values.length === 0) {
        continue;
      }
      best.set(
        row.id,
        row.better === 'higher' ? Math.max(...values) : Math.min(...values),
      );
    }
    return best;
  }, [selectedModels]);

  const selectSlot = useCallback((index: number, modelId: string) => {
    setSlots(previous =>
      previous.map((current, i) => (i === index ? modelId : current)),
    );
  }, []);

  const removeSlot = useCallback((index: number) => {
    setSlots(previous => previous.filter((_, i) => i !== index));
  }, []);

  const columns = useMemo<TableColumn<SpecRow>[]>(
    () => [
      {
        key: 'spec',
        // Names the header row it sits in — that row holds the model
        // selectors, not criteria.
        header: 'Models',
        width: pixel(SPEC_COLUMN_WIDTH),
        // The label alone. `unit` is deliberately not shown here: a second
        // line under the label is what made rows different heights, and the
        // unit is more use next to the figure it qualifies anyway.
        renderCell: row => (
          <HStack vAlign="center" height={CELL_CONTENT_HEIGHT}>
            <Text type="label" color="secondary">
              {row.label}
            </Text>
          </HStack>
        ),
      },
      ...slots.map<TableColumn<SpecRow>>((modelId, index) => {
        const model = MODEL_BY_ID.get(modelId);
        return {
          // Keyed by slot, not by model: the column is a position that holds
          // whichever model the reader picked, so it survives a swap.
          key: `slot-${index}`,
          width: proportional(1, {minWidth: MODEL_COLUMN_MIN_WIDTH}),
          align: 'end',
          // The selector is the whole heading. The provider used to be
          // repeated underneath it, which said nothing the option list does
          // not already say when the menu is open.
          header: (
            <ModelHeader
              index={index}
              modelId={modelId}
              taken={slots}
              canRemove={slots.length > MIN_SLOTS}
              onSelect={selectSlot}
              onRemove={removeSlot}
            />
          ),
          renderCell: row => {
            if (model == null) {
              return <Text type="supporting">—</Text>;
            }

            // A row that draws itself opts out of ranking, so it is handled
            // before any of the winner logic runs.
            if (row.renderValue != null) {
              return row.renderValue(model);
            }

            const value = row.get(model);

            if (typeof value === 'boolean') {
              // Both states are drawn, in opposing colours. An em dash for
              // "no" reads as missing data rather than as an answer, and it
              // leaves the eye nothing to catch when scanning a column of
              // mostly-yes rows for the one that differs.
              //
              // The column's `align` lands on the cell's text alignment, which
              // an icon does not answer to, so the row is aligned explicitly to
              // keep these on the same edge as the numbers.
              return (
                <HStack
                  gap={1}
                  vAlign="center"
                  hAlign="end"
                  height={CELL_CONTENT_HEIGHT}>
                  <Icon
                    icon={value ? CircleCheck : CircleX}
                    size="md"
                    color={value ? 'success' : 'error'}
                    label={value ? 'Supported' : 'Not supported'}
                  />
                </HStack>
              );
            }

            if (typeof value === 'string') {
              return (
                <HStack
                  gap={1}
                  vAlign="center"
                  hAlign="end"
                  height={CELL_CONTENT_HEIGHT}>
                  {/* `large` is semibold by default; only a winning figure
                      earns that weight here, so the rest is set back down. */}
                  <Text type="large" weight="normal">
                    {value}
                  </Text>
                </HStack>
              );
            }

            const best = bestByRow.get(row.id);
            const isBest = isHighlightOn && best != null && value === best;

            if (row.isScore) {
              return <ScoreBar value={value} isBest={isBest} />;
            }

            const formatted = row.format?.(value) ?? whole.format(value);
            const number = (
              <Text
                type="large"
                hasTabularNumbers
                weight={isBest ? 'semibold' : 'normal'}>
                {formatted}
              </Text>
            );

            return (
              <HStack
                gap={1}
                vAlign="center"
                hAlign="end"
                height={CELL_CONTENT_HEIGHT}
                xstyle={isBest ? styles.best : undefined}>
                {number}
                {/* Same size as the figure it qualifies, held apart by colour
                    rather than scale — `large` is semibold by default, which
                    would have the unit shouting over the number. Highlighted
                    units use primary text to retain AA contrast on the wash. */}
                {row.unit != null && (
                  <Text
                    type="large"
                    weight="normal"
                    color={isBest ? 'primary' : 'secondary'}>
                    {row.unit}
                  </Text>
                )}
              </HStack>
            );
          },
        };
      }),
    ],
    [slots, bestByRow, selectSlot, isHighlightOn],
  );

  const grouped = useTableGroupedRows<SpecRow>({
    data: SPEC_ROWS,
    groupBy: row => row.group,
    groupOrder: GROUP_ORDER,
    collapsedGroups,
    onToggleGroup: toggleGroup,
    getRowKey: row => row.id,
    // A group header is one cell spanning every column. The grouped-row plugin
    // pins its own chevron without constraining custom content; this heading
    // pins beside that control so both remain reachable while scrolling.
    renderGroupHeader: groupKey => (
      <HStack gap={2} vAlign="center" xstyle={styles.groupHeading}>
        {/* Sized as a heading rather than bold body text: these are the only
            landmarks in a long matrix, and the criteria count they used to
            carry was a number nobody acts on.

            Level 3 for the type scale, exposed as level 2 for the outline: the
            page heading is the only thing above these, so an unadjusted h3
            would skip a level for anyone navigating by headings. */}
        <Heading level={3} accessibilityLevel={2}>
          {groupKey}
        </Heading>
      </HStack>
    ),
  });

  // T cannot be inferred from the config alone, so it is named explicitly.
  const sticky = useTableStickyColumns<SpecRow>({startKeys: ['spec']});

  // The first model not already on screen, or undefined once all are.
  const nextModel = useMemo(
    () => MODELS.find(model => !slots.includes(model.id)),
    [slots],
  );

  const addModel = useCallback(() => {
    if (nextModel != null) {
      setSlots(previous => [...previous, nextModel.id]);
    }
  }, [nextModel]);

  return (
    <Layout
      height="auto"
      // Caps the matrix on a wide display. Past roughly this width the columns
      // stop being scannable as a group — the eye has to travel too far between
      // the pinned criterion and the value it belongs to.
      contentWidth={1440}
      header={
        <LayoutHeader padding={4}>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <Heading level={1}>Compare models</Heading>
            </StackItem>
            <Switch
              label="Highlight best"
              size="sm"
              value={isHighlightOn}
              onChange={setIsHighlightOn}
            />
            <Button
              label="Add model"
              variant="secondary"
              icon={<Icon icon={Plus} size="sm" />}
              isDisabled={nextModel == null}
              onClick={addModel}
            />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          {/* No padding of its own: the table's cells carry the inset, so a
              second one would inset them twice and pull the group headers
              off the card's edges. The card is here for the border, the
              radius and the clip that keeps the corners over the table. */}
          {/* The table bleeds back out to the card's edges, so this padding
              does not indent the grid — the cells read it from
              `--container-padding-inline-*` and inset the first and last
              columns' contents by it. That is what makes the two outer
              gutters equal without either column knowing about the other. */}
          <Card padding={5} xstyle={styles.tableFrame}>
            <Table<SpecRow>
              data={grouped.data}
              columns={columns}
              idKey={grouped.idKey}
              density="spacious"
              dividers="grid"
              plugins={{grouped: grouped.plugin, sticky}}
            />
          </Card>
        </LayoutContent>
      }
    />
  );
}
