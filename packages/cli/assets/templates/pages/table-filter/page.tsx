// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Table page driven by a row of filter selectors.
 *
 * Each filterable field is a Selector, so the closed trigger doubles as the
 * filter chip: unset it reads as the bare field name against the same outlined
 * chrome as the search box, and once set it fills in and expands to the whole
 * clause (`Status is Overdue`) with a clear beside it. Anything the selectors
 * can't express — free numeric comparisons, OR groups — swaps to power search,
 * and because both modes read the same filter array, a filter built either way
 * survives the swap.
 *
 * The same row is where saved views and bulk edit surface: selecting rows
 * replaces it with a selection bar, and the saved-views toggle swaps it for a
 * list of saved views. A saved view is the whole screen — the filters plus the
 * columns, density, sticky edges and grouping — so applying one restores the
 * table as it was, and there is no separate column preset to disagree with it.
 *
 * Clicking a row opens its details in the end panel. That is separate from the
 * checkbox selection driving bulk edit — a row can be open without being
 * selected, and vice versa.
 *
 * @input Deterministic fixtures only (field-service jobs for a mechanical
 *   contractor: customers, technicians, fixed ISO schedule times, quotes)
 */

import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SVGProps,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Item} from '@astryxdesign/core/Item';
import {List} from '@astryxdesign/core/List';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {useAnnounce, useMediaQuery} from '@astryxdesign/core/hooks';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import type {OverflowItem} from '@astryxdesign/core/OverflowList';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Token} from '@astryxdesign/core/Token';
import {Badge} from '@astryxdesign/core/Badge';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Popover} from '@astryxdesign/core/Popover';
import {Link} from '@astryxdesign/core/Link';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {Section} from '@astryxdesign/core/Section';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {ComplexSelector} from '@astryxdesign/core/ComplexSelector';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {Slider} from '@astryxdesign/core/Slider';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {
  PowerSearch,
  usePowerSearchConfig,
} from '@astryxdesign/core/PowerSearch';
import type {PowerSearchFilter} from '@astryxdesign/core/PowerSearch';
import {
  Table,
  pixel,
  proportional,
  useTableGroupedRows,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  useTableStickyColumns,
} from '@astryxdesign/core/Table';
import type {TableColumn, TablePlugin} from '@astryxdesign/core/Table';
import {
  Bookmark,
  BookmarkPlus,
  Calendar,
  ChevronDown,
  CircleX,
  Columns3,
  GripVertical,
  Image as ImageIcon,
  Pencil,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  Table2,
  UserPlus,
  X,
} from 'lucide-react';

// Lucide draws outlines, so a "filled" counterpart is the same glyph with its
// interior painted. `Icon` takes any SVG component, which is the supported way
// to hand it a variant the icon set does not ship as its own export.
const BookmarkFilled = (props: SVGProps<SVGSVGElement>) => (
  <Bookmark {...props} fill="currentColor" />
);
const SlidersHorizontalFilled = (props: SVGProps<SVGSVGElement>) => (
  <SlidersHorizontal {...props} fill="currentColor" />
);

// =============================================================================
// Data
// =============================================================================

type JobStatus =
  'scheduled' | 'in_progress' | 'on_hold' | 'overdue' | 'completed';
type Priority = 'urgent' | 'high' | 'normal';

/** The authored shape. Dates are derived on load, so they live on ServiceJob. */
interface SeedJob {
  id: string;
  summary: string;
  customer: string;
  address: string;
  technician: string;
  status: JobStatus;
  priority: Priority;
  /** ISO timestamp — the column sorts on this, so it stays a string. */
  scheduledAt: string;
  /** Quote in whole dollars, kept numeric so it sorts and filters. */
  quoted: number;
  equipment: string;
}

interface ServiceJob extends SeedJob, Record<string, unknown> {
  /**
   * The same instant as scheduledAt, as a Date. Power search rejects a string
   * date outright, so the date filters read this field while the column reads
   * the string above.
   */
  scheduledOn: Date;
}

/**
 * The hue variants, not the semantic ones. `warning` and `error` paint a solid
 * fill straight from --color-warning / --color-error, and a theme is free to
 * tune those as ink for text rather than as a surface — the neutral theme does,
 * so Overdue comes out a muddy maroon block. The hue variants read their own
 * background/text pair, which is a tint in every theme, so a column of these
 * stays legible wherever the page is themed. Red is left to carry the one state
 * worth chasing.
 *
 * On hold is grey because nothing is wrong with it — the work is parked, not
 * late — and a colour there would pull the eye off the row that is.
 *
 * The happy path walks the hue wheel in the direction the work travels:
 * Scheduled blue, In progress teal, Completed green. Teal is the stop between
 * the other two, so the ramp reads as progress rather than as three unrelated
 * tags.
 */
const STATUS_META: Record<
  JobStatus,
  {
    label: string;
    badge: 'neutral' | 'blue' | 'teal' | 'green' | 'red';
  }
> = {
  scheduled: {label: 'Scheduled', badge: 'blue'},
  in_progress: {label: 'In progress', badge: 'teal'},
  on_hold: {label: 'On hold', badge: 'neutral'},
  overdue: {label: 'Overdue', badge: 'red'},
  completed: {label: 'Completed', badge: 'green'},
};

/**
 * Priority is a three-step ramp read down a column, which is what a dot is for:
 * the eye picks out the reds without reading a word. Normal is neutral, so a
 * table of ordinary work is quiet.
 */
const PRIORITY_META: Record<
  Priority,
  {label: string; dot: 'neutral' | 'warning' | 'error'}
> = {
  urgent: {label: 'Urgent', dot: 'error'},
  high: {label: 'High', dot: 'warning'},
  normal: {label: 'Normal', dot: 'neutral'},
};

/** Primary detail-pane action per state — keeps the panel feeling like a tool. */
const NEXT_ACTION: Record<JobStatus, string> = {
  scheduled: 'Dispatch technician',
  in_progress: 'Mark complete',
  on_hold: 'Check parts order',
  overdue: 'Reschedule',
  completed: 'Create follow-up',
};

// Active work first, then recent completed jobs referenced as site history.
const seedJobs: SeedJob[] = [
  {
    id: 'SJ-2148',
    summary: 'No cooling — rooftop unit 3',
    customer: 'Harborview Grand Hotel',
    address: '1200 Harbor Blvd, Bayside',
    technician: 'Luis Camarena',
    status: 'in_progress',
    priority: 'urgent',
    scheduledAt: '2026-07-02T08:00:00Z',
    quoted: 1480,
    equipment: 'Trane RTU-3, 25-ton (2019)',
  },
  {
    id: 'SJ-2147',
    summary: 'Quarterly preventive maintenance',
    customer: 'Northgate Dental Group',
    address: '88 Northgate Mall, Suite 210',
    technician: 'Dana Whitfield',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-02T10:30:00Z',
    quoted: 420,
    equipment: 'Carrier split system, 5-ton',
  },
  {
    id: 'SJ-2146',
    summary: 'Walk-in freezer overshooting setpoint',
    customer: 'Beacon Street Bistro',
    address: '412 Beacon St',
    technician: 'Marcus Osei',
    status: 'on_hold',
    priority: 'high',
    scheduledAt: '2026-07-01T13:00:00Z',
    quoted: 2150,
    equipment: 'Kolpak walk-in, Copeland compressor',
  },
  {
    id: 'SJ-2145',
    summary: 'Thermostat replacement, suite 400',
    customer: 'Pinnacle Property Mgmt',
    address: '500 Commerce Tower, Floor 4',
    technician: 'Dana Whitfield',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-02T14:00:00Z',
    quoted: 310,
    equipment: 'Honeywell T6 Pro (2 units)',
  },
  {
    id: 'SJ-2144',
    summary: 'Boiler pilot fails to stay lit',
    customer: 'Elm & 5th Lofts',
    address: '501 Elm St',
    technician: 'Luis Camarena',
    status: 'overdue',
    priority: 'high',
    scheduledAt: '2026-07-01T09:00:00Z',
    quoted: 760,
    equipment: 'Weil-McLain CGa boiler (2011)',
  },
  {
    id: 'SJ-2143',
    summary: 'Condenser coil cleaning',
    customer: 'Riverside Athletic Club',
    address: '9 Riverside Way',
    technician: 'Priya Raman',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-03T07:30:00Z',
    quoted: 540,
    equipment: 'Lennox RTU, 20-ton (2018)',
  },
  {
    id: 'SJ-2142',
    summary: 'Intermittent short cycling',
    customer: 'Harborview Grand Hotel',
    address: '1200 Harbor Blvd, Bayside',
    technician: 'Marcus Osei',
    status: 'on_hold',
    priority: 'high',
    scheduledAt: '2026-07-01T15:30:00Z',
    quoted: 890,
    equipment: 'Trane RTU-1, 25-ton (2019)',
  },
  {
    id: 'SJ-2141',
    summary: 'Emergency steam leak, basement',
    customer: 'Elm & 5th Lofts',
    address: '501 Elm St',
    technician: 'Priya Raman',
    status: 'in_progress',
    priority: 'urgent',
    scheduledAt: '2026-07-01T06:00:00Z',
    quoted: 3200,
    equipment: 'Weil-McLain CGa boiler (2011)',
  },
  {
    id: 'SJ-2140',
    summary: 'Annual fire damper inspection',
    customer: 'Pinnacle Property Mgmt',
    address: '500 Commerce Tower, Floor 4',
    technician: 'Dana Whitfield',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-06T09:00:00Z',
    quoted: 1250,
    equipment: 'Building-wide duct network',
  },
  {
    id: 'SJ-2139',
    summary: 'Ice machine not producing',
    customer: 'Beacon Street Bistro',
    address: '412 Beacon St',
    technician: 'Luis Camarena',
    status: 'overdue',
    priority: 'urgent',
    scheduledAt: '2026-06-30T11:00:00Z',
    quoted: 680,
    equipment: 'Hoshizaki KM-660, air cooled',
  },
  {
    id: 'SJ-2138',
    summary: 'Makeup air unit rebalancing',
    customer: 'Northgate Dental Group',
    address: '88 Northgate Mall, Suite 210',
    technician: 'Priya Raman',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-07T13:00:00Z',
    quoted: 495,
    equipment: 'Greenheck MAU, 4000 CFM',
  },
  {
    id: 'SJ-2137',
    summary: 'Chiller low refrigerant alarm',
    customer: 'Summit Medical Plaza',
    address: '77 Summit Ridge Rd',
    technician: 'Marcus Osei',
    status: 'in_progress',
    priority: 'urgent',
    scheduledAt: '2026-07-01T08:30:00Z',
    quoted: 4100,
    equipment: 'Daikin air-cooled chiller, 80-ton',
  },
  {
    id: 'SJ-2136',
    summary: 'VAV box actuator replacement',
    customer: 'Summit Medical Plaza',
    address: '77 Summit Ridge Rd',
    technician: 'Dana Whitfield',
    status: 'scheduled',
    priority: 'high',
    scheduledAt: '2026-07-03T10:00:00Z',
    quoted: 720,
    equipment: 'Titus VAV, zones 12–15',
  },
  {
    id: 'SJ-2135',
    summary: 'Exhaust fan bearing noise',
    customer: 'Riverside Athletic Club',
    address: '9 Riverside Way',
    technician: 'Luis Camarena',
    status: 'on_hold',
    priority: 'normal',
    scheduledAt: '2026-06-30T14:30:00Z',
    quoted: 380,
    equipment: 'Greenheck exhaust fan, pool deck',
  },
  {
    id: 'SJ-2134',
    summary: 'Humidifier control board fault',
    customer: 'Summit Medical Plaza',
    address: '77 Summit Ridge Rd',
    technician: 'Priya Raman',
    status: 'overdue',
    priority: 'high',
    scheduledAt: '2026-06-29T09:30:00Z',
    quoted: 1340,
    equipment: 'DriSteem steam humidifier',
  },
  {
    id: 'SJ-2133',
    summary: 'Rooftop economizer stuck closed',
    customer: 'Northgate Dental Group',
    address: '88 Northgate Mall, Suite 210',
    technician: 'Marcus Osei',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-08T08:00:00Z',
    quoted: 610,
    equipment: 'Carrier split system, 5-ton',
  },
  {
    id: 'SJ-2132',
    summary: 'Hot water recirculation pump seized',
    customer: 'Elm & 5th Lofts',
    address: '501 Elm St',
    technician: 'Dana Whitfield',
    status: 'in_progress',
    priority: 'high',
    scheduledAt: '2026-07-01T12:00:00Z',
    quoted: 950,
    equipment: 'Taco 007 circulator',
  },
  {
    id: 'SJ-2131',
    summary: 'Split system quote, new tenant build',
    customer: 'Pinnacle Property Mgmt',
    address: '500 Commerce Tower, Floor 4',
    technician: 'Priya Raman',
    status: 'scheduled',
    priority: 'normal',
    scheduledAt: '2026-07-09T11:00:00Z',
    quoted: 8600,
    equipment: 'Proposed: Mitsubishi VRF, 6 zones',
  },
  {
    id: 'SJ-2101',
    summary: 'Compressor contactor replacement',
    customer: 'Harborview Grand Hotel',
    address: '1200 Harbor Blvd, Bayside',
    technician: 'Marcus Osei',
    status: 'completed',
    priority: 'high',
    scheduledAt: '2026-06-24T09:00:00Z',
    quoted: 640,
    equipment: 'Trane RTU-3, 25-ton (2019)',
  },
  {
    id: 'SJ-2095',
    summary: 'Pool dehumidifier service',
    customer: 'Riverside Athletic Club',
    address: '9 Riverside Way',
    technician: 'Dana Whitfield',
    status: 'completed',
    priority: 'normal',
    scheduledAt: '2026-06-22T08:00:00Z',
    quoted: 720,
    equipment: 'Seresco NP series dehumidifier',
  },
  {
    id: 'SJ-2088',
    summary: 'Refrigerant leak diagnostic',
    customer: 'Beacon Street Bistro',
    address: '412 Beacon St',
    technician: 'Luis Camarena',
    status: 'completed',
    priority: 'normal',
    scheduledAt: '2026-06-18T11:00:00Z',
    quoted: 390,
    equipment: 'Kolpak walk-in, Copeland compressor',
  },
  {
    id: 'SJ-2081',
    summary: 'Chiller annual certification',
    customer: 'Summit Medical Plaza',
    address: '77 Summit Ridge Rd',
    technician: 'Priya Raman',
    status: 'completed',
    priority: 'high',
    scheduledAt: '2026-06-15T07:00:00Z',
    quoted: 2450,
    equipment: 'Daikin air-cooled chiller, 80-ton',
  },
  {
    id: 'SJ-2067',
    summary: 'RTU belt and filter service',
    customer: 'Pinnacle Property Mgmt',
    address: '500 Commerce Tower, Floor 4',
    technician: 'Dana Whitfield',
    status: 'completed',
    priority: 'normal',
    scheduledAt: '2026-06-12T08:30:00Z',
    quoted: 280,
    equipment: 'York RTU, 15-ton (2016)',
  },
  {
    id: 'SJ-2044',
    summary: 'Cooling tower fan bearing replacement',
    customer: 'Harborview Grand Hotel',
    address: '1200 Harbor Blvd, Bayside',
    technician: 'Marcus Osei',
    status: 'completed',
    priority: 'high',
    scheduledAt: '2026-05-28T07:30:00Z',
    quoted: 1120,
    equipment: 'BAC cooling tower, cell 2',
  },
  {
    id: 'SJ-2019',
    summary: 'Spring maintenance visit',
    customer: 'Northgate Dental Group',
    address: '88 Northgate Mall, Suite 210',
    technician: 'Dana Whitfield',
    status: 'completed',
    priority: 'normal',
    scheduledAt: '2026-04-15T10:00:00Z',
    quoted: 420,
    equipment: 'Carrier split system, 5-ton',
  },
];

const DAY_MS = 86_400_000;

/** Read once at load, so a preset's filter value stays referentially stable. */
const NOW_MS = Date.now();

/**
 * The authored dates are fixed, so they slide into the past as this template
 * ages and an "Upcoming" filter would match nothing. Shifting the whole set on
 * load keeps the backlog straddling today, with the newest job about three
 * weeks out.
 */
const DATE_SHIFT_MS =
  NOW_MS +
  21 * DAY_MS -
  Math.max(...seedJobs.map(j => Date.parse(j.scheduledAt)));

/**
 * A job in the past can't still be waiting to happen, and one from months ago
 * isn't still under way, so an authored status only survives where the shifted
 * date still supports it.
 */
function statusForDate(authored: JobStatus, when: number): JobStatus {
  if (when > NOW_MS) {
    return 'scheduled';
  }
  // Recently missed work is still chaseable; anything older has been closed
  // out one way or another.
  const isRecent = when > NOW_MS - 45 * DAY_MS;
  if (authored === 'scheduled') {
    return isRecent ? 'overdue' : 'completed';
  }
  if (authored === 'in_progress' && !isRecent) {
    return 'completed';
  }
  return authored;
}

/**
 * The authored rows are cycled backwards through the calendar into a longer
 * backlog, so the infinite scroll below has several batches to fetch. A real
 * screen gets this from its Relay connection instead.
 */
const allJobs: ServiceJob[] = Array.from({length: 5}, (_, cycle) =>
  seedJobs.map((job, index) => {
    // The per-row term decorrelates the cycles, so repeat visits to the same
    // site spread across the calendar instead of stacking up next to each
    // other once the table sorts by date.
    const cycleDays = cycle === 0 ? 0 : cycle * 37 + ((index * 13) % 29);
    const when =
      Date.parse(job.scheduledAt) + DATE_SHIFT_MS - cycleDays * DAY_MS;
    const scheduledOn = new Date(when);
    return {
      ...job,
      id:
        cycle === 0
          ? job.id
          : `SJ-${1999 - (cycle - 1) * seedJobs.length - index}`,
      status: statusForDate(job.status, when),
      scheduledAt: scheduledOn.toISOString(),
      scheduledOn,
      quoted: cycle === 0 ? job.quoted : job.quoted + ((index * 17) % 9) * 10,
    };
  }),
).flat();

const TECHNICIANS = Array.from(new Set(allJobs.map(j => j.technician))).sort();
const CUSTOMERS = Array.from(new Set(allJobs.map(j => j.customer))).sort();

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * UTC-based formatters, so the fixed fixtures render identically everywhere.
 * A locale-aware Timestamp would shift these by the viewer's offset and then
 * disagree with the table column beside it.
 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes}${suffix}`;
}

function formatDate(iso: string, withYear = false): string {
  const d = new Date(iso);
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base;
}

const formatScheduled = (iso: string) =>
  `${formatDate(iso)}, ${formatTime(iso)}`;

const formatMoney = (amount: number) => `$${amount.toLocaleString('en-US')}`;

// =============================================================================
// Filter configuration
//
// One config backs both the token list and power search, so the two are always
// describing the same filter array.
// =============================================================================

const fieldDefs = [
  {key: 'summary', type: 'string', label: 'Summary'},
  {
    key: 'customer',
    type: 'enum',
    label: 'Customer',
    enumValues: CUSTOMERS.map(v => ({value: v, label: v})),
  },
  {
    key: 'technician',
    type: 'enum',
    label: 'Technician',
    enumValues: TECHNICIANS.map(v => ({value: v, label: v})),
  },
  {
    key: 'status',
    type: 'enum',
    label: 'Status',
    enumValues: (Object.keys(STATUS_META) as JobStatus[]).map(v => ({
      value: v,
      label: STATUS_META[v].label,
    })),
  },
  {
    key: 'priority',
    type: 'enum',
    label: 'Priority',
    enumValues: (Object.keys(PRIORITY_META) as Priority[]).map(v => ({
      value: v,
      label: PRIORITY_META[v].label,
    })),
  },
  {key: 'quoted', type: 'number', label: 'Quote'},
  {key: 'scheduledOn', type: 'date', label: 'Scheduled'},
] as const;

/** Bounds for the quote range slider, snapped outward to round money. */
const QUOTE_MIN = 0;
const QUOTE_MAX =
  Math.ceil(Math.max(...allJobs.map(j => j.quoted)) / 500) * 500;
const QUOTE_STEP = 100;

/**
 * A single-value field in the filter bar, rendered as a Button-triggered
 * dropdown so the closed trigger doubles as the chip. Quote sits outside this
 * list — it is a range, not a pick — and so do the many-of fields below.
 */
interface FilterField {
  key: string;
  label: string;
  operator: string;
  operatorLabel: string;
  /** Filter value type handed to power search, so both modes agree. */
  valueType: 'enum' | 'integer';
  options: ReadonlyArray<{value: string; label: string}>;
}

const FILTER_FIELDS: readonly FilterField[] = [
  {
    key: 'priority',
    label: 'Priority',
    operator: 'is',
    operatorLabel: 'is',
    valueType: 'enum',
    options: (Object.keys(PRIORITY_META) as Priority[]).map(v => ({
      value: v,
      label: PRIORITY_META[v].label,
    })),
  },
];

/**
 * Fields a reader narrows by picking several at once — "show me on hold and
 * overdue", "these two crews". Priority stays single because its three steps
 * are a ramp: picking two of three is the same as excluding one, which the
 * table already shows.
 *
 * `is_any_of` is what lets a field hold more than one value. applyFilters ANDs
 * same-field clauses, so a second `is` would contradict the first rather than
 * widen it.
 */
const MULTI_FILTER_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  options: ReadonlyArray<{value: string; label: string}>;
}> = [
  {
    key: 'status',
    label: 'Status',
    options: (Object.keys(STATUS_META) as JobStatus[]).map(v => ({
      value: v,
      label: STATUS_META[v].label,
    })),
  },
  {
    key: 'customer',
    label: 'Customer',
    options: CUSTOMERS.map(v => ({value: v, label: v})),
  },
  {
    key: 'technician',
    label: 'Technician',
    options: TECHNICIANS.map(v => ({value: v, label: v})),
  },
];

/**
 * A canned filter offered as a one-click toggle, with field, operator and value
 * all fixed up front. Each preset owns a field no other control in the bar
 * touches — a preset on status or priority would fight the dropdown that also
 * writes that field, since one clause per field is all either can express.
 */
const PRESET_FILTERS: ReadonlyArray<{
  key: string;
  label: string;
  filter: PowerSearchFilter;
}> = [
  {
    key: 'upcoming',
    label: 'Upcoming',
    filter: {
      field: 'scheduledOn',
      operator: 'after',
      value: {type: 'date_absolute', unixSeconds: Math.floor(NOW_MS / 1000)},
    },
  },
];

/** Human-readable value for a filter chip label. */
const VALUE_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    (Object.keys(STATUS_META) as JobStatus[]).map(k => [
      k,
      STATUS_META[k].label,
    ]),
  ),
  ...Object.fromEntries(
    (Object.keys(PRIORITY_META) as Priority[]).map(k => [
      k,
      PRIORITY_META[k].label,
    ]),
  ),
};

// =============================================================================
// Bulk edit actions
// =============================================================================

const BULK_EDIT_ACTIONS: ReadonlyArray<{
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: (selected: ServiceJob[]) => void;
}> = [
  {
    key: 'assign',
    label: 'Assign',
    icon: <Icon icon={UserPlus} size="sm" />,
    onClick: s => alert(`Assign technician: ${s.map(j => j.id).join(', ')}`),
  },
  {
    key: 'reschedule',
    label: 'Reschedule',
    icon: <Icon icon={Calendar} size="sm" />,
    onClick: s => alert(`Reschedule: ${s.map(j => j.id).join(', ')}`),
  },
  {
    key: 'cancel',
    label: 'Cancel',
    icon: <Icon icon={CircleX} size="sm" />,
    onClick: s => alert(`Cancel: ${s.map(j => j.id).join(', ')}`),
  },
];

// =============================================================================
// View options
// =============================================================================

type ViewSection = 'columns' | 'density' | 'sticky' | 'grouping';
type Density = 'compact' | 'balanced' | 'spacious';
type StickyEdge = 'none' | 'one' | 'two';
/** Field the rows section under. 'none' leaves the table flat. */
type GroupField = 'none' | 'status' | 'priority' | 'technician' | 'customer';

const VIEW_SECTIONS: ReadonlyArray<{
  key: ViewSection;
  label: string;
  icon: React.ReactNode;
  title: string;
}> = [
  {
    key: 'columns',
    label: 'Columns',
    icon: <Icon icon={Columns3} size="sm" />,
    title: 'Columns',
  },
  {
    key: 'density',
    label: 'Density',
    icon: <Icon icon={TableIcon} size="sm" />,
    title: 'Density',
  },
  {
    key: 'sticky',
    label: 'Sticky Columns',
    icon: <Icon icon={Pin} size="sm" />,
    title: 'Sticky Columns',
  },
  {
    key: 'grouping',
    label: 'Grouping',
    icon: <Icon icon={Table2} size="sm" />,
    title: 'Grouping',
  },
];

const DENSITY_OPTIONS: ReadonlyArray<{value: Density; label: string}> = [
  {value: 'compact', label: 'Compact'},
  {value: 'balanced', label: 'Balanced'},
  {value: 'spacious', label: 'Spacious'},
];

/**
 * Split by edge, because an edge names its own columns — "First two columns"
 * against the start, "Last two columns" against the end. Naming them here is
 * what lets the radio list and a saved view's summary state a frozen edge in
 * the same words.
 */
const STICKY_START_OPTIONS: ReadonlyArray<{
  value: StickyEdge;
  label: string;
}> = [
  {value: 'none', label: 'None'},
  {value: 'one', label: 'First column'},
  {value: 'two', label: 'First two columns'},
];

const STICKY_END_OPTIONS: ReadonlyArray<{value: StickyEdge; label: string}> = [
  {value: 'none', label: 'None'},
  {value: 'one', label: 'Last column'},
  {value: 'two', label: 'Last two columns'},
];

const GROUPING_OPTIONS: ReadonlyArray<{value: GroupField; label: string}> = [
  {value: 'none', label: 'None'},
  {value: 'status', label: 'Status'},
  {value: 'priority', label: 'Priority'},
  {value: 'technician', label: 'Technician'},
  {value: 'customer', label: 'Customer'},
];

/**
 * The words a section is titled with. The group key is what the heading prints,
 * so it has to be the label and not the stored value — grouping by status would
 * otherwise head its sections "on_hold". Technician and customer are stored as
 * their own labels already, which is what the fallback covers.
 */
function groupKeyOf(job: ServiceJob, field: GroupField): string {
  if (field === 'none') {
    return '';
  }
  const stored = String(job[field]);
  return VALUE_LABELS[stored] ?? stored;
}

/**
 * Section order per field. Without it the sections would come out in whatever
 * order the active sort happened to surface them, so status and priority take
 * their canonical severity order and the two name fields stay alphabetical.
 *
 * Listed as labels, because that is what groupKeyOf produces and these have to
 * match it to rank anything.
 */
const GROUP_ORDERS: Record<GroupField, string[]> = {
  none: [],
  status: Object.keys(STATUS_META).map(k => VALUE_LABELS[k] ?? k),
  priority: Object.keys(PRIORITY_META).map(k => VALUE_LABELS[k] ?? k),
  technician: TECHNICIANS,
  customer: CUSTOMERS,
};

/** Row-key prefix the grouped-rows plugin gives its synthetic header rows. */
const GROUP_ROW_KEY_PREFIX = '__group_';

/** Fed to the grouping hook while grouping is off, so it flattens nothing. */
const NO_ROWS: ServiceJob[] = [];

const COLUMN_LABELS: Record<string, string> = {
  summary: 'Job',
  customer: 'Customer',
  technician: 'Technician',
  status: 'Status',
  priority: 'Priority',
  scheduledAt: 'Scheduled',
  quoted: 'Quote',
  equipment: 'Equipment',
  address: 'Address',
};

const ALL_COLUMN_KEYS = [
  'summary',
  'customer',
  'technician',
  'status',
  'priority',
  'scheduledAt',
  'quoted',
  'equipment',
  'address',
];
const DEFAULT_COLUMN_KEYS = [
  'summary',
  'customer',
  'technician',
  'status',
  'priority',
  'scheduledAt',
  'quoted',
];

/**
 * The column that names the row. A table of jobs with no job on it is a table
 * of orphaned attributes, so this one stays: its remove control is disabled and
 * says why. Position is not identity, so it still reorders like any other.
 */
const LOCKED_COLUMN_KEY = 'summary';
const LOCKED_COLUMN_MESSAGE = 'Job names every row, so it cannot be removed.';

/** Pointer travel before a press on the grip becomes a drag rather than a tap. */
const REORDER_DRAG_THRESHOLD = 5;

/**
 * A reorder in flight. Positions are indices into the *visible* displayed list
 * — the one the reader is looking at — so a search that hides rows cannot make
 * the arrow keys or the drop indicator point somewhere off screen.
 */
interface ColumnReorderSession {
  key: string;
  mode: 'keyboard' | 'pointer';
  /** Visible order as it was when the drag began; the drag reads from this. */
  originalKeys: string[];
  fromIndex: number;
  toIndex: number;
  pointerId?: number;
  pointerStartY?: number;
  hasPointerMoved?: boolean;
}

/** Draft of every view option, so the panel can Cancel without touching the table. */
interface ViewState {
  columnKeys: string[];
  density: Density;
  stickyStart: StickyEdge;
  stickyEnd: StickyEdge;
  grouping: GroupField;
}

const INITIAL_VIEW: ViewState = {
  columnKeys: DEFAULT_COLUMN_KEYS,
  density: 'balanced',
  stickyStart: 'one',
  stickyEnd: 'none',
  grouping: 'customer',
};

/**
 * The screen opens on open work — every status except Completed. Landing on a
 * list of closed jobs is a poor first impression, and an unfiltered table
 * shows the filter bar in its resting state, which hides the chip, the result
 * count and Clear all behind a click. The saved-view baseline is the same set,
 * so the template arrives already demonstrating what it is for.
 */
const INITIAL_FILTERS: PowerSearchFilter[] = [
  {
    field: 'status',
    operator: 'is_any_of',
    value: {
      type: 'enum_list',
      value: (Object.keys(STATUS_META) as JobStatus[]).filter(
        status => status !== 'completed',
      ),
    },
  },
];

/**
 * Severity order for the enum columns, because their labels do not sort into
 * it. Alphabetically Priority runs High, Normal, Urgent — which files the rows
 * that matter in the middle. Rank is what a reader means by "sort by
 * priority", so the comparator reaches for this before falling back to a
 * string compare.
 */
const SORT_RANKS: Record<string, Record<string, number>> = {
  priority: {urgent: 0, high: 1, normal: 2},
  status: {overdue: 0, on_hold: 1, in_progress: 2, scheduled: 3, completed: 4},
};

const PAGE_SIZE = 15;

/** Key the selection plugin gives the checkbox column it prepends. */
const SELECTION_COLUMN_KEY = '__xds_selection';

// =============================================================================
// Saved views
//
// Declared after ViewState so a saved view can carry one. A view is the whole
// configuration of the screen, not just its filters: the columns on show and
// their order, plus density, sticky edges and grouping. That is what makes a
// column preset redundant — the columns travel with the view that named them.
// =============================================================================

interface SavedView {
  id: string;
  name: string;
  filters: PowerSearchFilter[];
  /** Columns, density, sticky edges and grouping as they were when saved. */
  view: ViewState;
}

const INITIAL_SAVED_VIEWS: SavedView[] = [
  {
    id: 'needs-dispatch',
    name: 'Needs dispatch',
    filters: [
      {
        field: 'status',
        operator: 'is',
        value: {type: 'enum', value: 'scheduled'},
      },
    ],
    view: INITIAL_VIEW,
  },
  {
    id: 'luis-open',
    name: "Luis's jobs",
    filters: [
      {
        field: 'technician',
        operator: 'is',
        value: {type: 'enum', value: 'Luis Camarena'},
      },
    ],
    // Technician is redundant once every row is Luis, and the shape of the day
    // is what this view is for, so it drops that column and groups by status.
    view: {
      ...INITIAL_VIEW,
      columnKeys: DEFAULT_COLUMN_KEYS.filter(k => k !== 'technician'),
      grouping: 'status',
    },
  },
  {
    id: 'high-value',
    name: 'High value',
    filters: [
      {
        // Same operator the range slider writes, so loading this view moves
        // the slider's low thumb instead of leaving it looking untouched.
        field: 'quoted',
        operator: 'greater_than_or_equal',
        value: {type: 'integer', value: 1000},
      },
    ],
    // Money is the point here, so the quote column is pinned to the end edge
    // and the rows tighten up to get more of them under the eye at once.
    view: {...INITIAL_VIEW, density: 'compact', stickyEnd: 'one'},
  },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * The surfaces below swap to a bottom sheet on a compact surface.
 *
 * Two terms, because there are two ways to be one. The second is the query the
 * Dialog adaptive-presentation block uses — up to `lg` on a device whose
 * pointer is a finger — and it is what catches a tablet that has the width for
 * a popover but no hover to drive one.
 *
 * The first is width alone, at any input. A 660px popover and a resizable side
 * panel need room the window no longer has well before the pointer changes:
 * below `md` the popover has nowhere to sit, and the panel leaves the table a
 * couple of columns wide. A mouse does not rescue a layout that does not fit,
 * so the narrow window gets sheets too.
 */
const COMPACT_SURFACE_QUERY =
  '(max-width: 768px), (max-width: 1024px) and (pointer: coarse) and (hover: none)';

/**
 * Top padding for whatever opens a BottomSheet, on the spacing scale.
 *
 * The panel's grab pill floats over the content instead of reserving layout
 * space for itself: it is 4px centered in a 24px band, so it covers the top
 * 10-14px of the sheet. Content that starts at the usual 16px gutter clears it
 * by 2px, which does not read as a gap — it reads as the sheet being cut off.
 * Opening at the full 24px band puts real space under the pill, and every
 * sheet here uses this one value so they all start on the same line.
 */
const SHEET_TOP_INSET = 6;

/**
 * Width the filter row holds back, in px, for the readout that trails the
 * clauses — the density toggle, the result count and Clear all.
 *
 * The readout sits inside the slot the overflow list measures, so without this
 * the list would count the readout's width as room for another clause and
 * push it off the end. The slot pays for it as padding, which is the one part
 * of the slot the measurement already subtracts, and the readout takes the
 * width back with a matching negative margin so it still lands against the
 * last clause instead of at the far edge.
 *
 * Deliberately a little wider than the readout draws at the counts this page
 * reaches, because the two failure directions are not symmetric: too wide only
 * folds a clause marginally early, while too narrow puts the readout over the
 * edge of the row.
 */
const READOUT_RESERVE = 184;

/**
 * Stands in for Relay's `usePaginationFragment` so the table can grow by
 * batches instead of flipping pages. It returns the same
 * `{data, hasNext, isLoadingNext, loadNext}` shape a Relay connection does, so
 * a real screen swaps this line for `usePaginationFragment(QUERY, query)` and
 * keeps everything below unchanged.
 */
function useInfiniteBatches<T>(
  items: readonly T[],
  pageSize: number,
  getGroupKey?: ((item: T) => string) | null,
): {
  data: T[];
  hasNext: boolean;
  isLoadingNext: boolean;
  loadNext: (count: number) => void;
} {
  const [loadedCount, setLoadedCount] = useState(pageSize);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const inFlightRef = useRef(false);

  // A new filter/sort result is a new connection: start from the first batch.
  useEffect(() => {
    inFlightRef.current = false;
    setIsLoadingNext(false);
    setLoadedCount(pageSize);
  }, [items, pageSize]);

  // A cut that lands mid-section leaves that section half-filled, and a reader
  // has no way to tell one that is still arriving from one that is genuinely
  // short — so the rows they can see are not a section they can trust. Carry
  // the cut to the end of whichever section it lands in. Sections are
  // contiguous because `results` sorts by group first, so this walks the tail
  // of one section and stops.
  const visibleCount = useMemo(() => {
    if (loadedCount >= items.length) {
      return items.length;
    }
    if (getGroupKey == null) {
      return loadedCount;
    }
    const openKey = getGroupKey(items[loadedCount - 1]);
    let end = loadedCount;
    while (end < items.length && getGroupKey(items[end]) === openKey) {
      end++;
    }
    return end;
  }, [getGroupKey, items, loadedCount]);

  // The next batch counts from what is on screen, not from the raw cut, so
  // rows a snap already pulled in are not paid for twice. Held in a ref to
  // keep loadNext stable — it is an effect dependency of the sentinel.
  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;

  const loadNext = useCallback((count: number) => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setIsLoadingNext(true);
    // Stands in for the network round trip Relay would make here.
    setTimeout(() => {
      setLoadedCount(visibleCountRef.current + count);
      setIsLoadingNext(false);
      inFlightRef.current = false;
    }, 500);
  }, []);

  const data = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );

  return {data, hasNext: visibleCount < items.length, isLoadingNext, loadNext};
}

/**
 * Each value is looked up before the join, not after: a many-of clause carries
 * a list of enum keys, and joining first would hand VALUE_LABELS the string
 * "on_hold, overdue", miss, and print the wire names.
 */
function filterValueText(filter: PowerSearchFilter): string {
  const raw = (filter.value as {value?: unknown}).value;
  const label = (v: unknown) => {
    const key = String(v ?? '');
    return VALUE_LABELS[key] ?? key;
  };
  return Array.isArray(raw) ? raw.map(label).join(', ') : label(raw);
}

/** Reads as the operator does in a power search token, not as its wire name. */
const OPERATOR_LABELS: Record<string, string> = {
  is: 'is',
  is_any_of: 'is any of',
  greater_than_or_equal: '≥',
  less_than_or_equal: '≤',
  after: 'after',
};

/**
 * One clause phrased the way power search phrases it, so a saved view's filters
 * read the same wherever they are shown. Money is formatted per field rather
 * than by sniffing the number, since a bare 1000 under Quote and under a count
 * are different things.
 */
function filterTokenLabel(filter: PowerSearchFilter): string {
  const field = fieldDefs.find(f => f.key === filter.field);
  const name = field?.label ?? filter.field;
  const operator = OPERATOR_LABELS[filter.operator] ?? filter.operator;
  const raw = filter.value as {value?: unknown; unixSeconds?: number};
  let value: string;
  if (typeof raw.unixSeconds === 'number') {
    // A date clause carries unixSeconds rather than `value`, so it would
    // otherwise render as a bare "Scheduled after" with nothing after it.
    value = formatDate(new Date(raw.unixSeconds * 1000).toISOString(), true);
  } else if (Array.isArray(raw.value) && raw.value.length > 1) {
    // Spelling out every selection makes a token wider than the dialog, and a
    // token that ellipsises mid-name is worse than an honest count.
    const [first, ...rest] = raw.value.map(v => VALUE_LABELS[String(v)] ?? v);
    value = `${first} +${rest.length}`;
  } else if (field?.type === 'number' && typeof raw.value === 'number') {
    value = formatMoney(raw.value);
  } else {
    value = filterValueText(filter);
  }
  return `${name} ${operator} ${value}`;
}

const stickyKeys = (
  edge: StickyEdge,
  keys: string[],
  fromEnd: boolean,
): string[] => {
  const count = edge === 'one' ? 1 : edge === 'two' ? 2 : 0;
  if (count === 0) {
    return [];
  }
  return fromEnd ? keys.slice(-count) : keys.slice(0, count);
};

const styles = stylex.create({
  // height="fill" resolves to height:100%, which needs a definite height the
  // host's <html>/<body> don't set. Without it the shell grows to fit the
  // table, the document scrolls, and the end panel rides away with it.
  pageShell: {
    height: '100dvh',
    // Layout is transparent by design, so without this the shell inherits
    // whatever the host paints. That reads fine on a bare UA canvas but puts
    // dark-mode text on a light page the moment the host has a background of
    // its own. Owning the surface makes the page legible wherever it is
    // embedded.
    backgroundColor: colorVars['--color-background-surface'],
    // A pinned cell paints an opaque base so scrolled content cannot show
    // through it, and that base defaults to the card token — right for a table
    // inside a card, wrong for this one, which sits on the page surface. Both
    // tokens are the same white in light mode, so the mismatch only surfaces
    // in dark, as a darker band exactly where the frozen columns are.
    '--table-sticky-background': colorVars['--color-background-surface'],
  },
  // A wrapped row's `gap` sets both axes, and 8px between stacked lines is more
  // air than these need; the row gap is tightened back to 6 on its own.
  bar: {
    rowGap: 6,
  },
  // Collapses rather than wrapping: clauses that no longer fit fold into the
  // overflow trigger, so the row is one line at every width.
  filterRow: {
    rowGap: 6,
  },
  // This slot is what `observeParent` measures, so its width has to mean "the
  // room the clauses have" and nothing else. Grow is the part that makes that
  // true: as the row's only grower it settles at the width left over once the
  // search box has taken its share, whatever the clauses inside happen to add
  // up to.
  //
  // Left at grow 0 the slot is flex-basis auto, which is to say content-sized,
  // and that feeds the list its own output: collapse one clause, the content
  // narrows, the slot narrows with it, the list re-reads the smaller number
  // and collapses again. It runs all the way down to `minVisibleItems` in one
  // pass. At 1200px that showed as a single clause and a +6 next to 500px of
  // empty row. Grow breaks the circuit by sizing the slot from the row instead
  // of from the clauses.
  //
  // The slot is also the readout's container rather than its sibling, which is
  // what keeps the readout beside the last clause instead of riding the row's
  // trailing edge — see READOUT_RESERVE for how its width is kept out of the
  // measurement.
  filterOverflowSlot: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    // The held-back width, as padding because padding is the one part of the
    // box the measurement already subtracts.
    paddingInlineEnd: READOUT_RESERVE,
    // Weighted far above the search box's 1 so the row gives in an order
    // rather than proportionally. Flex shares a deficit by shrink factor times
    // basis, so a 100 here means the clauses fold away to the bare count
    // before the field gives up its first pixel, and the field only starts
    // shrinking once there is nothing left to fold.
    flexShrink: 100,
    // Where folding stops. StackItem resets min-width to 0, and with a shrink
    // this aggressive that lets the slot pass the collapsed state and clip the
    // count itself — the filters are then set, applied, and unreachable, with
    // nothing on the row to say so. The floor is the trigger's own 44px plus
    // the reserve, because min-width bounds the border box and the reserve is
    // padding inside it — 44 on its own would floor a slot with nothing left
    // to put the trigger in. The last thing the row gives up is the way back
    // to what it folded.
    minWidth: 44 + READOUT_RESERVE,
  },
  // See the note in FilterOverflow: a flex column stretches its child, which
  // is what puts the button-backed presets on the same edge as the selectors.
  overflowItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  // Queried rather than @media: opening the detail panel narrows this header
  // without the viewport changing, and that is the width the toolbar actually
  // has to fit in.
  toolbarContainer: {
    containerName: 'toolbar',
    containerType: 'inline-size',
  },
  // Taking the full line forces the trailing cluster onto a second row. Below
  // this the filter row and the view controls were splitting the width so
  // evenly that neither had enough: the filters were collapsing into overflow
  // while the buttons still had room to spare.
  toolbarPrimary: {
    flexBasis: {
      default: 0,
      '@container toolbar (max-width: 860px)': '100%',
    },
  },
  // Holds the cluster against the end edge on its own row, where it would
  // otherwise sit under the filters at the start.
  toolbarEnd: {
    marginInlineStart: 'auto',
  },
  // Takes back the width the slot held back for it, so the readout draws over
  // the reserve rather than after it and lands against the last clause. The
  // gap to that clause is a margin rather than the slot's `gap`, because a gap
  // would fall on the measured side of the reserve and cost the clauses the
  // last few pixels they were measured to have.
  filterMeta: {
    flexShrink: 0,
    marginInlineStart: 8,
    marginInlineEnd: -READOUT_RESERVE,
  },
  savedViewsLabel: {
    flexShrink: 0,
  },
  // Basis auto so the slot is exactly as wide as the chips while they fit —
  // shrinking only once they do not, which is the width the scroller inside
  // then has to work with.
  savedViewsSlot: {
    flexShrink: 1,
    minWidth: 0,
  },
  savedViewsScroller: {
    overflowX: 'auto',
    // The row is one line: without this the block axis picks up a scrollbar of
    // its own the moment the inline one appears.
    overflowY: 'hidden',
    // Keeps a swipe that runs off the end of the chips from turning into a
    // page scroll, which on a phone reads as the whole view lurching sideways.
    overscrollBehaviorInline: 'contain',
    // No scrollbar under a 32px row: it would eat as much height as the chips
    // and sit there permanently on the platforms that reserve space for it.
    // The chip cut off at the edge is the affordance instead, and every chip
    // is a button, so tabbing scrolls the next one into view for a keyboard.
    scrollbarWidth: 'none',
  },
  // In a nowrap row that scrolls, a shrinkable child squeezes to fit rather
  // than overflowing: without this the chips compress into unreadable stubs
  // and the scroller never has anything to scroll.
  savedViewChip: {
    flexShrink: 0,
  },
  // A saved view can carry more clauses than the dialog is wide.
  tokenWrap: {
    flexWrap: 'wrap',
    rowGap: 4,
  },
  // Token ellipsises on overflow, but only once it is allowed to shrink below
  // its content; without this a long clause runs past the dialog edge instead.
  filterToken: {
    minWidth: 0,
    maxWidth: '100%',
  },
  progress: {
    position: 'absolute',
    insetBlockStart: 0,
    insetInline: 0,
  },
  headerWrap: {
    position: 'relative',
  },
  // The bulk bar now sits inside the header's 16px gutter, so it needs a
  // corner radius to read as a band rather than a clipped full-bleed strip.
  bulkBand: {
    borderRadius: radiusVars['--radius-element'],
  },
  // The bar mounts the moment the first row is checked, so its entry is a
  // `@starting-style` transition rather than a keyframe or a mount flag: the
  // settled value is the one written here, so an interrupted transition still
  // lands correctly. Reduced motion collapses the duration instead of the
  // property — a media query can't nest inside `@starting-style`, so the
  // duration is what gets conditioned (same form as ToastViewport/Markdown).
  bulkBandEnter: {
    opacity: 1,
    transform: 'translateY(0)',
    transitionProperty: 'opacity, transform',
    transitionDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    '@starting-style': {
      opacity: 0,
      transform: `translateY(${spacingVars['--spacing-3']})`,
    },
  },
  // Sits at the width of the filter selectors beside it so the row reads as
  // one family of controls, and widens on focus for typing room. TextInput's
  // `width` prop is the sanctioned way to size a field, but it takes one
  // static value and cannot express a focus variant, so the width lives here.
  //
  // On the slot rather than on the field: TextInput's `xstyle` lands on an
  // element inside its outer wrapper, and that wrapper is the row's actual
  // flex item. Sized from within, the wrapper keeps `min-width: auto`, its
  // min-content becomes the focused 240px, and no shrink factor can move it —
  // the field stays rigid and pushes the readout off the end of the row. A
  // StackItem resets that min-width, so the width and the give belong to the
  // same box and the field can widen into space it actually has.
  //
  // `:focus-within` is in scope here for the same reason it was on the field:
  // the focused input is a descendant either way, so no React state is needed.
  searchSlot: {
    // Second in line to give, behind the overflow slot's 100 and ahead of the
    // readout's 0 (see filterOverflowSlot). The focus width is a request
    // rather than a reservation: a 393px row cannot seat 240px of search and
    // still show "Clear all", so the field takes what the folded clauses left
    // and stops there — full width where the window has it, a little under it
    // where it does not.
    flexShrink: 1,
    // Never narrower than its resting width, so a tight row cannot grind the
    // field down to a stub. Costs nothing idle: 120 is where it already sits.
    minWidth: 120,
    width: {
      default: 120,
      ':focus-within': 240,
    },
    transitionProperty: 'width',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // ButtonVariantMap has no outline variant, so the Button-backed toggles in
  // the row paint the field chrome the selectors beside them draw natively —
  // same border token, same radius — rather than reading as a different
  // family of control.
  filterChrome: {
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-emphasized'],
    borderRadius: radiusVars['--radius-element'],
  },
  filterSurface: {
    backgroundColor: colorVars['--color-background-surface'],
  },
  // The fill a control switches to once it carries a value. This is the token
  // ToggleButton paints for its own pressed state, so a set selector and a
  // pressed preset land on the same value over the same backdrop instead of
  // two neighbouring shades of engaged.
  filterFill: {
    backgroundColor: colorVars['--color-overlay-pressed'],
  },
  // ComplexSelector's popup only floors its width at the trigger's, and the
  // Quote trigger is as narrow as its label. A range slider needs a track long
  // enough to resolve $100 steps under the thumb, so the popup states one.
  quotePopover: {
    width: 300,
  },
  // A Selector states its own emptiness typographically — placeholder weight
  // and secondary text unset, body weight and primary text once it holds a
  // value. Button labels are medium and always primary, so without this the
  // unpressed toggles sit heavier and darker than the unset selectors they
  // are meant to match.
  filterLabelValue: {
    fontWeight: fontWeightVars['--font-weight-normal'],
  },
  filterLabelEmpty: {
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  // Popover paints a 12px gutter on its content container and publishes no
  // padding prop, so the only way to a flush container is xstyle. It lands on
  // that same container, and these are the exact longhands Popover sets — a
  // `padding` shorthand would compile to the physical properties and leave the
  // logical ones standing. Flush, the rail's divider and the footer rule reach
  // the popover edges, and each region below re-states its own gutter.
  viewPopoverSurface: {
    paddingBlockStart: 0,
    paddingBlockEnd: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
  },
  // The popover's height is set here rather than left to each section, so it
  // doesn't resize under the pointer as the reader moves down the rail — the
  // trigger is at the top right, so a shrinking panel would walk the rail out
  // from under the cursor. Columns fills this height and scrolls inside it;
  // the other three are shorter and are padded out to it.
  //
  // A fixed height, not a minimum: min-height alone is a floor, so a long
  // column list would still push the popover past it, and a panel can only
  // scroll once some ancestor gives it a height to scroll within.
  viewPopover: {
    blockSize: 448,
  },
  // ESCAPE HATCH (see report): DialogHeader takes no `padding`, and inside a
  // Dialog its LayoutHeader adds the dialog's own gutter a second time — the
  // title lands at 32px while a Section body lands at 16px. Section escapes
  // this by negative-margining out of the container padding before it pads
  // itself; Layout does the same, which is why the canonical block puts one
  // between Dialog and DialogHeader. Same escape, applied to the header
  // directly, so its own 16px is the only gutter. Block-end is left alone —
  // the header's bottom padding is real spacing, not an edge to cancel.
  dialogHeaderBleed: {
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    marginBlockStart: 'calc(-1 * var(--container-padding-block-start, 0px))',
  },
  // Wide enough for "Sticky Columns" on one line once the rail carries its own
  // gutter rather than borrowing the popover's.
  viewRail: {
    width: 184,
    flexShrink: 0,
  },
  // Pairs with the rail's 4px gutter: the item keeps Button's own
  // --radius-element and sits inside the popover's --radius-container, so the
  // two corners curve together instead of the item squaring off in a rounded
  // box. Both tokens move with the theme's radius multiplier, so the pairing
  // survives a theme swap.
  railItem: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  // Starts the strip on the sheet's own 16px gutter instead of the container
  // edge, so the first tab lines up with the panel below it. Padding rather
  // than margin: on a scroller the gutter has to be part of the scrollable box
  // or the strip cannot scroll its last tab clear of the trailing edge.
  //
  // Inline only. The sheet's top inset is the wrapper's, not this box's: the
  // strip's scroll arrow is absolutely positioned against this box at
  // inset-block-start 0, so block padding here pushes the tabs down and leaves
  // the arrow hanging above the row it scrolls.
  viewSheetTabs: {
    paddingInline: 16,
  },
  // Full height so the transfer panels can reach the popover floor: sized to
  // its content instead, the pane stops short and the rule between the panels
  // ends in mid-air — most visibly when a search empties both sides.
  viewPanel: {
    blockSize: '100%',
    flexGrow: 1,
    minWidth: 0,
  },
  // --- Columns transfer list -------------------------------------------------
  // Copies the lab TransferList's panel chrome rather than importing it: that
  // package is unpublished and does not resolve from the template viewer, so
  // the visual contract is restated here against the same tokens.
  // The lab component stacks its panels under `@container (max-width: 40rem)`.
  // That query is not carried over: this pane is the popover's 660px less the
  // 184px rail and its gutters — about 28rem — so the stacked branch would be
  // the only one that ever ran, and side by side is the layout this panel is
  // for. The pane has no other width to respond to; the popover is fixed.
  transferRoot: {
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
  },
  // The pair runs to the pane's edges, so the rule between them is full height
  // and each panel's header rule reaches its own edges. Nothing here is padded:
  // the gutter lives on the header, the rows and the empty state instead, via
  // the two Pad styles below.
  transferPanels: {
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
  },
  // flexBasis 0 with grow splits the row into two equal halves; the two minimums
  // then let a half shrink below its content instead of pushing the popover
  // wider or taller than the height every other section is held to, which is
  // what lets a long column list scroll inside its own panel.
  transferPanel: {
    flexBasis: 0,
    flexGrow: 1,
    minBlockSize: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  // 16px against the pane's outer edge, 12px against the divider: the outer
  // gutter matches the heading above, and the inner one only has to clear a
  // 1px rule.
  transferPadStart: {
    paddingInlineEnd: spacingVars['--spacing-3'],
    paddingInlineStart: spacingVars['--spacing-4'],
  },
  transferPadEnd: {
    paddingInlineEnd: spacingVars['--spacing-4'],
    paddingInlineStart: spacingVars['--spacing-3'],
  },
  transferPanelDivider: {
    borderInlineStartColor: colorVars['--color-border'],
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: borderVars['--border-width'],
  },
  transferPanelHeader: {
    borderBlockEndColor: colorVars['--color-border'],
    borderBlockEndStyle: 'solid',
    borderBlockEndWidth: borderVars['--border-width'],
  },
  // The bulk action sits on the header rule beside a label, where button chrome
  // would outweigh the list it acts on. Stripped to a text link, it reads as
  // secondary to the rows without losing the accent that marks it actionable.
  transferHeaderAction: {
    backgroundImage: {
      default: 'none',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': 'none',
      ':active': 'none',
    },
    borderRadius: 0,
    color: colorVars['--color-text-accent'],
    fontSize: typeScaleVars['--text-body-size'],
    fontWeight: typeScaleVars['--text-body-weight'],
    height: 'auto',
    lineHeight: typeScaleVars['--text-body-leading'],
    paddingBlock: 0,
    paddingInline: 0,
    textDecoration: {
      default: 'none',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': 'underline',
    },
  },
  // Each panel scrolls its own rows within whatever height the pane gives it,
  // so adding columns lengthens a list instead of growing the popover past the
  // viewport. The floor is the popover's own minHeight rather than a size set
  // here, which is what keeps the four tabs the same height.
  transferPanelBody: {
    flexGrow: 1,
    minBlockSize: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    scrollbarGutter: 'stable',
  },
  // Padded by transferPadStart/End rather than Item's own gutter, so a row's
  // hover and selected fill runs the full width of the panel while its text
  // stays on the header's start line. The grip and the end action then pull
  // back by their own button inset (transferGrip, transferEndAction) so it is
  // the glyph that lands on the line, not the invisible button box.
  transferItem: {
    minWidth: 0,
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionProperty: 'background-color, opacity',
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // A keyboard pick-up has no pointer under it to say what is moving, so the
  // row itself carries the state.
  transferItemPicked: {
    backgroundColor: colorVars['--color-accent-muted'],
  },
  transferEmpty: {
    textAlign: 'center',
  },
  // A ghost IconButton insets its glyph by --spacing-1-5; cancelling that puts
  // the grip itself on the panel's start line rather than the button box.
  transferGrip: {
    marginInlineStart: `calc(-1 * ${spacingVars['--spacing-1-5']})`,
  },
  // Same cancellation at the other edge, so the row's action lands on the end
  // line that "Restore" and "Select all" sit on.
  transferEndAction: {
    marginInlineEnd: `calc(-1 * ${spacingVars['--spacing-1-5']})`,
  },
  clickableRow: {
    cursor: 'pointer',
  },
  // One step past hover in the same neutral ramp. A muted fill can't carry
  // this on its own — --color-background-muted resolves to the identical
  // value as --color-overlay-hover. Row background belongs to this state
  // alone: selection opts out of its wash so the two never compete.
  activeRow: {
    backgroundColor: colorVars['--color-overlay-pressed'],
    // A pinned cell paints an opaque background of its own, which would cover
    // the row's. Publishing the overlay is how the sticky plugin picks it up
    // and replays it, the same way TableRow does for striping and hover.
    '--table-row-overlay': colorVars['--color-overlay-pressed'],
  },
  // A flex child has no definite width for AspectRatio to derive a height
  // from, so the tile is pinned here and told not to give the width back when
  // the cell runs short.
  jobMedia: {
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-element'],
    flexShrink: 0,
    width: spacingVars['--spacing-12'],
  },
  detailPanel: {
    minWidth: 0,
  },
  skeletonRow: {
    // The table drops the divider under its last row, so each placeholder
    // carries its own on top — one line between every row, none trailing.
    borderBlockStartColor: colorVars['--color-border'],
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: borderVars['--border-width'],
  },
  // The table bleeds past this container to the layout edge and re-applies the
  // inset on its outer cells. Matching that keeps the two grids on one axis.
  skeletonBleed: {
    marginInline: 'calc(-1 * var(--container-padding-inline-start, 0px))',
  },
  skeletonEdgeStart: {
    paddingInlineStart: 'var(--container-padding-inline-start, 0px)',
  },
  skeletonEdgeEnd: {
    paddingInlineEnd: 'var(--container-padding-inline-end, 0px)',
  },
});

/**
 * The insertion rule the drop indicator draws. Absolute inside the row it marks
 * and pulled half its own height clear of it, so it lands in the gap between
 * two rows rather than on top of either.
 */
const reorderIndicator = {
  backgroundColor: colorVars['--color-accent'],
  borderRadius: radiusVars['--radius-full'],
  content: '""',
  height: spacingVars['--spacing-0-5'],
  insetInline: 0,
  pointerEvents: 'none' as const,
  position: 'absolute' as const,
  zIndex: 2,
};

/**
 * The drag states a reorderable row moves through, mirroring the lab package's
 * shared reorderStyles: the row being dragged fades to half, the row the
 * pointer is over grows an accent rule on the side the drop would land, and the
 * grip carries the grab cursors.
 */
const reorderStyles = stylex.create({
  source: {
    opacity: 0.5,
    userSelect: 'none',
  },
  dropBefore: {
    position: 'relative',
    '::before': {
      ...reorderIndicator,
      insetBlockStart: `calc(-1 * ${spacingVars['--spacing-0-5']})`,
    },
  },
  dropAfter: {
    position: 'relative',
    '::after': {
      ...reorderIndicator,
      insetBlockEnd: `calc(-1 * ${spacingVars['--spacing-0-5']})`,
    },
  },
  handle: {cursor: 'grab', touchAction: 'none'},
  handleActive: {cursor: 'grabbing', touchAction: 'none'},
});

/**
 * Widths come straight from the column definitions, so a placeholder cell
 * occupies the same track as the real one whatever the reader has configured.
 */
const skeletonCell = stylex.create({
  row: (paddingBlock: number) => ({paddingBlock}),
  fixed: (width: number, paddingInline: number) => ({
    flexGrow: 0,
    flexShrink: 0,
    paddingInline,
    width,
  }),
  flexible: (flexGrow: number, minWidth: number, paddingInline: number) => ({
    flexBasis: 0,
    flexGrow,
    minWidth,
    paddingInline,
  }),
});

/** Placeholder rows standing in for the batch being fetched. */
const SKELETON_ROWS = 5;

/**
 * Width of the injected selection column. Wide enough to land its checkbox on
 * the 16px content gutter LayoutContent gives every other first cell.
 */
const SELECTION_COLUMN_WIDTH = 48;

/** Cell padding per density, mirroring the table's own scale. */
const DENSITY_PADDING: Record<Density, number> = {
  compact: 8,
  balanced: 12,
  spacious: 16,
};

/**
 * The batch still in flight, drawn as rows rather than a spinner so the page
 * keeps its shape while it loads. Cells are sized from the live column
 * definitions, so each bar sits under the column it is about to fill.
 */
function LoadingRows({
  columns,
  density,
}: {
  columns: TableColumn<ServiceJob>[];
  density: Density;
}) {
  const pad = DENSITY_PADDING[density];
  return (
    <VStack
      gap={0}
      role="status"
      aria-label="Loading more jobs"
      xstyle={styles.skeletonBleed}>
      {Array.from({length: SKELETON_ROWS}, (_, row) => (
        <HStack
          key={row}
          gap={0}
          aria-hidden
          xstyle={[styles.skeletonRow, skeletonCell.row(pad)]}>
          <VStack
            gap={0}
            vAlign="center"
            xstyle={[
              skeletonCell.fixed(SELECTION_COLUMN_WIDTH, 0),
              styles.skeletonEdgeStart,
            ]}>
            <Skeleton width={16} height={16} radius={1} index={row} />
          </VStack>
          {columns.map((col, index) => (
            <VStack
              key={col.key}
              gap={0}
              vAlign="center"
              xstyle={[
                col.width?.type === 'pixel'
                  ? skeletonCell.fixed(col.width.value, pad)
                  : skeletonCell.flexible(
                      col.width?.value ?? 1,
                      col.width?.minWidth ?? 120,
                      pad,
                    ),
                index === columns.length - 1 && styles.skeletonEdgeEnd,
              ]}>
              {col.key === 'summary' && density !== 'compact' ? (
                // The Job cell runs to two lines everywhere but compact;
                // matching that keeps the placeholders on the same rhythm as
                // the rows above.
                <VStack gap={2}>
                  <Skeleton height={14} index={row * 4 + index} />
                  <Skeleton
                    width="40%"
                    height={11}
                    index={row * 4 + index + 1}
                  />
                </VStack>
              ) : (
                <Skeleton height={12} index={row * 4 + index} />
              )}
            </VStack>
          ))}
        </HStack>
      ))}
    </VStack>
  );
}

/**
 * Everything a saved view carries besides its filters, as key/value rows, so
 * the dialogs can state what is being captured instead of leaving the reader
 * to assume a view is only a filter list.
 *
 * A setting still gets a row at its default value. Naming only the
 * non-defaults reads as a diff against a baseline the reader cannot see, and
 * leaves them guessing whether an absent setting is at its default or simply
 * not something a view carries.
 */
function ViewSummaryList({
  view,
  filters,
}: {
  view: ViewState;
  /**
   * Shown as the clauses themselves rather than a count: "3 filters" says a
   * view narrows the table without saying to what, which is the one thing the
   * reader is deciding on.
   */
  filters: readonly PowerSearchFilter[];
}) {
  const density = DENSITY_OPTIONS.find(o => o.value === view.density);
  const grouping = GROUPING_OPTIONS.find(o => o.value === view.grouping);
  const stickyStart = STICKY_START_OPTIONS.find(
    o => o.value === view.stickyStart,
  );
  const stickyEnd = STICKY_END_OPTIONS.find(o => o.value === view.stickyEnd);

  return (
    <MetadataList columns="single" label={{position: 'start', width: 104}}>
      <MetadataListItem label="Filters">
        {filters.length === 0 ? (
          <Text type="body">None</Text>
        ) : (
          <HStack gap={1} xstyle={styles.tokenWrap}>
            {filters.map(f => (
              <Token
                key={`${f.field}-${f.operator}-${filterValueText(f)}`}
                label={filterTokenLabel(f)}
                description={`${f.field} ${f.operator} ${filterValueText(f)}`}
                size="sm"
                xstyle={styles.filterToken}
              />
            ))}
          </HStack>
        )}
      </MetadataListItem>
      <MetadataListItem label="Columns">
        <Text type="body">
          {view.columnKeys.length} of {ALL_COLUMN_KEYS.length}
        </Text>
      </MetadataListItem>
      <MetadataListItem label="Density">
        <Text type="body">{density?.label ?? view.density}</Text>
      </MetadataListItem>
      <MetadataListItem label="Grouping">
        <Text type="body">{grouping?.label ?? view.grouping}</Text>
      </MetadataListItem>
      <MetadataListItem label="Frozen start">
        <Text type="body">{stickyStart?.label ?? view.stickyStart}</Text>
      </MetadataListItem>
      <MetadataListItem label="Frozen end">
        <Text type="body">{stickyEnd?.label ?? view.stickyEnd}</Text>
      </MetadataListItem>
    </MetadataList>
  );
}

/**
 * The clauses the row could not fit, behind one trigger.
 *
 * A DropdownMenu is the usual overflow anchor and is the wrong one here: these
 * items are selectors that open popovers of their own, and a popover opened
 * inside a menu fights the menu for the same dismissal. A plain panel holds
 * them as they already are, so a folded clause is the same control it was on
 * the row rather than a menu entry that re-states it.
 *
 * `child` is rendered straight through rather than rebuilt from `index`: the
 * element in an OverflowItem is the one the list measured, already bound to
 * the same filter state, so a clause set here and a clause set on the row are
 * the same control writing to the same place.
 */
function FilterOverflow({
  items,
  isCompactSurface,
}: {
  items: OverflowItem[];
  isCompactSurface: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const count = items.length;
  const label = `${count} more ${count === 1 ? 'filter' : 'filters'}`;

  // Each control fills the panel rather than sizing to its own label the way
  // it does on the row: a column of content-width triggers reads as a ragged
  // edge, not a list. The stack stretches its items, but that only reaches the
  // wrapper — the selectors are block-level and follow it, while the preset
  // toggles are buttons and stay at their label width. Making each wrapper a
  // column stretches whatever is inside it, so both kinds land on one edge.
  const body = (
    <VStack
      gap={2}
      padding={isCompactSurface ? 4 : 0}
      paddingBlockStart={isCompactSurface ? SHEET_TOP_INSET : 0}>
      {items.map(({child, index}) => (
        <StackItem key={index} xstyle={styles.overflowItem}>
          {child}
        </StackItem>
      ))}
    </VStack>
  );

  const trigger = (
    <Button
      label={`+${count}`}
      tooltip={label}
      aria-label={label}
      variant="ghost"
      size="sm"
      xstyle={[styles.filterChrome, styles.filterSurface]}
      onClick={isCompactSurface ? () => setIsOpen(true) : undefined}
    />
  );

  if (isCompactSurface) {
    return (
      <>
        {trigger}
        {/* `hug` rather than a fixed budget: the folded set is however many
            clauses did not fit, so the sheet is as tall as it needs to be
            instead of holding a gap under three controls. */}
        <BottomSheet
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          label={label}
          height="hug"
          padding={0}>
          {body}
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover
      placement="below"
      alignment="end"
      width={280}
      label={label}
      content={body}>
      {trigger}
    </Popover>
  );
}

/**
 * The saved-view forms, as a dialog with a pointer and a sheet on a phone.
 *
 * Both hosts get `purpose="form"`, which is the same contract in each: the
 * scrim will not dismiss, and neither will a swipe on the sheet, so a name
 * half-typed survives a stray touch. That leaves Escape as the only implicit
 * way out — and a phone has no Escape — so the explicit close is not optional
 * here the way it is on a Dialog that can fall back to the keyboard. The X
 * below is the sheet's, matching the one DialogHeader supplies on the other
 * branch.
 *
 * `tall` for the same reason both forms take a name: only a fully expanded
 * tall sheet moves a focused field clear of the mobile keyboard, and a shorter
 * budget would leave the caret behind it.
 */
function AdaptiveSavedViewForm({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  isCompactSurface,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  subtitle: string;
  isCompactSurface: boolean;
  children: ReactNode;
}) {
  if (isCompactSurface) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        label={title}
        purpose="form"
        height="tall">
        <Section
          variant="transparent"
          padding={4}
          paddingBlockStart={SHEET_TOP_INSET}>
          <VStack gap={4}>
            <HStack gap={2}>
              <StackItem size="fill">
                <VStack gap={1}>
                  <Heading level={3}>{title}</Heading>
                  <Text type="supporting" color="secondary">
                    {subtitle}
                  </Text>
                </VStack>
              </StackItem>
              <IconButton
                label={`Close ${title.toLowerCase()}`}
                variant="ghost"
                size="sm"
                icon={<Icon icon={X} size="sm" />}
                onClick={() => onOpenChange(false)}
              />
            </HStack>
            {children}
          </VStack>
        </Section>
      </BottomSheet>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={400}>
      <DialogHeader
        title={title}
        subtitle={subtitle}
        onOpenChange={onOpenChange}
        xstyle={styles.dialogHeaderBleed}
      />
      <Section variant="transparent" padding={4}>
        <VStack gap={4}>{children}</VStack>
      </Section>
    </Dialog>
  );
}

// =============================================================================
// Template
// =============================================================================

export default function TableFilterTemplate() {
  // Named for the surface, not the size: `isCompact` further down is the
  // density setting, which is a different thing entirely.
  //
  // Read through useSyncExternalStore, so this is the real match on the first
  // client render rather than a default that corrects itself afterwards —
  // which is what lets the auto-open effect below trust it.
  const isCompactSurface = useMediaQuery(COMPACT_SURFACE_QUERY);

  // --- Filtering -------------------------------------------------------------
  const [filters, setFilters] = useState<PowerSearchFilter[]>(INITIAL_FILTERS);
  const [isPowerSearch, setIsPowerSearch] = useState(false);
  const [query, setQuery] = useState('');

  // --- Saved views -----------------------------------------------------------
  const [savedViews, setSavedViews] = useState(INITIAL_SAVED_VIEWS);
  const [isSavedViewsBarOpen, setIsSavedViewsBarOpen] = useState(false);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(
    null,
  );
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedView | null>(null);

  // --- Selection -------------------------------------------------------------
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  /** Row whose details are open in the end panel. Independent of bulk selection. */
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // The floor keeps the MetadataList's 104px label column from squeezing its
  // values below a readable line; the ceiling stops the panel from taking so
  // much room that the table loses its sortable columns.
  const detailWidth = useResizable({
    defaultSize: 380,
    minSize: 320,
    maxSize: 560,
  });

  // --- Sorting ---------------------------------------------------------------
  const [sort, setSort] = useState<
    Array<{sortKey: string; direction: 'ascending' | 'descending'}>
  >([{sortKey: 'priority', direction: 'ascending'}]);

  // --- View options ----------------------------------------------------------
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [viewSection, setViewSection] = useState<ViewSection>('columns');
  const [isViewOpen, setIsViewOpen] = useState(false);
  /**
   * The column reorder in flight, if any. Held in a ref as well as state
   * because a pointermove reads the session it is continuing before React has
   * re-rendered the one the previous move wrote.
   */
  const [reorderSession, setReorderSessionState] =
    useState<ColumnReorderSession | null>(null);
  const reorderSessionRef = useRef<ColumnReorderSession | null>(null);
  /** Live row elements of the displayed list, so a drag can measure them. */
  const columnRowRefs = useRef(new Map<string, HTMLElement>());
  /** A drag ends in a click the grip must not read as a keyboard pick-up. */
  const suppressGripClickRef = useRef(false);
  const announce = useAnnounce();
  const columnPanelId = useId();
  /**
   * Only the sheet's strip is a tablist, so only its panel carries this id.
   * The popover renders the same body without one, which is what keeps the id
   * unique: a closed BottomSheet still renders its children, so both copies of
   * the panel are in the document at once whenever the popover is open.
   */
  const viewPanelId = useId();
  /** Group keys the reader has folded shut. Empty means every section is open. */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  // --- Misc ------------------------------------------------------------------
  const [isLoading, setIsLoading] = useState(false);

  const {config, applyFilters} = usePowerSearchConfig(fieldDefs, 'Jobs');

  // A filter change refetches; the top progress bar stands in for that.
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 450);
    return () => clearTimeout(timer);
  }, [filters, query]);

  const groupField = view.grouping;
  const isGrouped = groupField !== 'none';

  const results = useMemo(() => {
    const byFilters = applyFilters(filters, allJobs);
    const q = query.trim().toLowerCase();
    const byQuery = q
      ? byFilters.filter(
          j =>
            j.summary.toLowerCase().includes(q) ||
            j.customer.toLowerCase().includes(q) ||
            j.id.toLowerCase().includes(q),
        )
      : byFilters;
    if (sort.length === 0 && !isGrouped) {
      return byQuery;
    }
    // Grouping sorts before the user's own keys, which is what keeps a
    // section's rows contiguous in the result set. Batches then fill the
    // sections in order and always land at the bottom of the table; grouping
    // whatever a row-ordered slice happened to contain would instead scatter
    // every section across every batch and splice new rows in above the fold.
    // A real backend does the same thing — ORDER BY group, then by sort.
    const groupRank = isGrouped
      ? new Map(GROUP_ORDERS[groupField].map((key, i) => [key, i]))
      : null;
    return [...byQuery].sort((a, b) => {
      if (groupRank != null) {
        const cmp =
          (groupRank.get(groupKeyOf(a, groupField)) ??
            Number.MAX_SAFE_INTEGER) -
          (groupRank.get(groupKeyOf(b, groupField)) ?? Number.MAX_SAFE_INTEGER);
        if (cmp !== 0) {
          return cmp;
        }
      }
      for (const {sortKey, direction} of sort) {
        const av = a[sortKey];
        const bv = b[sortKey];
        const rank = SORT_RANKS[sortKey];
        let cmp: number;
        if (rank != null) {
          // An unranked value sorts last rather than first, so a value the map
          // has not heard of cannot displace Urgent at the top.
          cmp =
            (rank[String(av)] ?? Number.MAX_SAFE_INTEGER) -
            (rank[String(bv)] ?? Number.MAX_SAFE_INTEGER);
        } else if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        }
        if (cmp !== 0) {
          return direction === 'ascending' ? cmp : -cmp;
        }
      }
      return 0;
    });
  }, [applyFilters, filters, groupField, isGrouped, query, sort]);

  // Grouped, the page unit is the section; flat, it is the row. Passing the
  // key only while grouping keeps an ungrouped view on even page sizes.
  const batchGroupKey = useMemo(
    () => (isGrouped ? (job: ServiceJob) => groupKeyOf(job, groupField) : null),
    [groupField, isGrouped],
  );

  const {
    data: rows,
    hasNext,
    isLoadingNext,
    loadNext,
  } = useInfiniteBatches(results, PAGE_SIZE, batchGroupKey);

  // The sentinel sits under the last row; when it scrolls into view the next
  // batch loads. The root stays the viewport so this works whether the page
  // scrolls or the LayoutContent scrolls inside a height-constrained shell.
  const sentinelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel == null || !hasNext) {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          loadNext(PAGE_SIZE);
        }
      },
      {rootMargin: '240px'},
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadNext]);

  // --- Filter mutation -------------------------------------------------------
  const setFieldFilter = useCallback(
    (fieldKey: string, next: PowerSearchFilter | null) => {
      setActiveSavedViewId(null);
      setFilters(current => {
        const rest = current.filter(f => f.field !== fieldKey);
        return next ? [...rest, next] : rest;
      });
    },
    [],
  );

  const togglePreset = useCallback((filter: PowerSearchFilter) => {
    setActiveSavedViewId(null);
    setFilters(current =>
      current.some(f => JSON.stringify(f) === JSON.stringify(filter))
        ? current.filter(f => JSON.stringify(f) !== JSON.stringify(filter))
        : [...current.filter(f => f.field !== filter.field), filter],
    );
  }, []);

  const clearAll = useCallback(() => {
    setFilters([]);
    setQuery('');
    setActiveSavedViewId(null);
  }, []);

  // --- Many-of fields --------------------------------------------------------
  /**
   * One pass over the clause list keyed by field, rather than a pair of hooks
   * per field, so adding a many-of field is a MULTI_FILTER_FIELDS entry and
   * nothing else. A saved view or a hand-typed power-search clause may have
   * written a single `is`, so a scalar reads back as a one-item list.
   */
  const multiValues = useMemo(() => {
    const byField: Record<string, string[]> = {};
    for (const field of MULTI_FILTER_FIELDS) {
      const active = filters.find(f => f.field === field.key);
      const raw = active ? (active.value as {value?: unknown}).value : null;
      byField[field.key] = Array.isArray(raw)
        ? raw.map(String)
        : raw == null
          ? []
          : [String(raw)];
    }
    return byField;
  }, [filters]);

  const setMultiValues = useCallback(
    (field: string, next: string[]) => {
      setFieldFilter(
        field,
        next.length === 0
          ? null
          : {
              field,
              operator: 'is_any_of',
              value: {type: 'enum_list', value: next},
            },
      );
    },
    [setFieldFilter],
  );

  // --- Quote: range ----------------------------------------------------------
  // Two bounds rather than one clause: power search has no numeric `between`,
  // and applyFilters ANDs same-field clauses, so a pair reads as a range in
  // both modes.
  const boundValue = (operator: string, fallback: number) => {
    const found = filters.find(
      f => f.field === 'quoted' && f.operator === operator,
    );
    return found ? Number((found.value as {value: number}).value) : fallback;
  };
  const quoteLow = boundValue('greater_than_or_equal', QUOTE_MIN);
  const quoteHigh = boundValue('less_than_or_equal', QUOTE_MAX);

  // Dragging updates a draft; the committed filter waits for onChangeEnd so
  // the table and its loading bar don't rerun on every pointer move.
  const [quoteDraft, setQuoteDraft] = useState<[number, number]>([
    quoteLow,
    quoteHigh,
  ]);
  useEffect(() => setQuoteDraft([quoteLow, quoteHigh]), [quoteLow, quoteHigh]);

  const commitQuote = useCallback((next: [number, number]) => {
    setActiveSavedViewId(null);
    setFilters(current => {
      const rest = current.filter(f => f.field !== 'quoted');
      const bounds: PowerSearchFilter[] = [];
      if (next[0] > QUOTE_MIN) {
        bounds.push({
          field: 'quoted',
          operator: 'greater_than_or_equal',
          value: {type: 'integer', value: next[0]},
        });
      }
      if (next[1] < QUOTE_MAX) {
        bounds.push({
          field: 'quoted',
          operator: 'less_than_or_equal',
          value: {type: 'integer', value: next[1]},
        });
      }
      return [...rest, ...bounds];
    });
  }, []);

  const hasQuoteFilter = quoteLow > QUOTE_MIN || quoteHigh < QUOTE_MAX;

  /**
   * The clause the closed trigger reads as, matching the selectors beside it.
   * Undefined while the range is untouched, so ComplexSelector falls back to
   * its own placeholder and paints the unset treatment itself.
   */
  const quoteLabel = !hasQuoteFilter
    ? undefined
    : quoteLow > QUOTE_MIN && quoteHigh < QUOTE_MAX
      ? `Quote ${formatMoney(quoteLow)} – ${formatMoney(quoteHigh)}`
      : quoteLow > QUOTE_MIN
        ? `Quote over ${formatMoney(quoteLow)}`
        : `Quote under ${formatMoney(quoteHigh)}`;

  // --- Saved view actions ----------------------------------------------------
  /**
   * A saved view is the whole screen, so applying one restores the view
   * configuration alongside the filters.
   *
   * Passing null is the All chip: it stands for no saved view, not for the
   * default configuration, so it drops the filters and leaves the columns,
   * density, sticky edges and grouping exactly as the reader has them.
   */
  const applySavedView = useCallback((saved: SavedView | null) => {
    setActiveSavedViewId(saved?.id ?? null);
    setFilters(saved ? [...saved.filters] : []);
    // A saved view carries structured filters, which power search cannot show.
    // Leaving the query bar up would strand the reader on a mode that no longer
    // describes what the table is doing, so choosing a view wins over the mode
    // they were in.
    setIsPowerSearch(false);
    if (saved == null) {
      return;
    }
    const restored: ViewState = {
      ...saved.view,
      columnKeys: [...saved.view.columnKeys],
    };
    setView(restored);
    // A collapsed key only means something under the field it came from, so
    // arriving on a different grouping opens every section again.
    setCollapsedGroups(new Set());
  }, []);

  const createSavedView = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      const id = `saved-${Date.now()}`;
      setSavedViews(list => [
        ...list,
        {
          id,
          name: trimmed,
          filters: [...filters],
          view: {...view, columnKeys: [...view.columnKeys]},
        },
      ]);
      setActiveSavedViewId(id);
      setCreatingName(null);
    },
    [filters, view],
  );

  const saveEditedView = useCallback((edited: SavedView) => {
    setSavedViews(list =>
      list.map(s => (s.id === edited.id ? {...s, name: edited.name} : s)),
    );
    setEditing(null);
  }, []);

  const deleteSavedView = useCallback((id: string) => {
    setSavedViews(list => list.filter(s => s.id !== id));
    setActiveSavedViewId(current => (current === id ? null : current));
    setEditing(null);
  }, []);

  /**
   * Every view control writes straight through to the live table: the panel has
   * no commit step, so what the reader sees behind the popover is always what
   * the controls say.
   *
   * With no Apply to hang it off, stepping off the active saved view moves here.
   * That makes the first toggle detach from the view rather than the last one,
   * which is the trade instant apply asks for — reconfiguring the table is what
   * leaves a saved view, and now there is no moment to defer it to.
   */
  const updateView = useCallback(
    (patch: (current: ViewState) => ViewState) => {
      const next = patch(view);
      // A collapsed key only means something under the field it came from, so
      // regrouping opens every section again.
      if (next.grouping !== view.grouping) {
        setCollapsedGroups(new Set());
      }
      setView(next);
      setActiveSavedViewId(null);
    },
    [view],
  );

  // --- Table plugins ---------------------------------------------------------
  const {selectionConfig} = useTableSelectionState({
    data: rows,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selectionPlugin = useTableSelection<ServiceJob>({
    ...selectionConfig,
    getRowLabel: (item: ServiceJob) => `${item.id} ${item.summary}`,
    // Row background already means "open in the panel" here, so checking a box
    // must not claim it too — two row states sharing one signal reads as one
    // confused state. The tick is the selection; aria-selected is still set
    // either way, so this costs assistive tech nothing.
    hasRowHighlight: false,
  });
  const sortablePlugin = useTableSortable<ServiceJob>({
    sort,
    onSortChange: setSort,
    allowUnsortedState: true,
    isMultiSortEnabled: true,
  });
  /**
   * A frozen column is dropped on a compact surface, whichever edge it is on.
   *
   * Freezing trades scrollable width for a column that stays put, and that is
   * a good trade only while there is width left to scroll. The table is around
   * 1300px; on a 393px screen a pinned Job column takes most of what there is
   * and leaves a strip too narrow to read a second column in — the reader
   * scrolls a sliver past a column they were already looking at.
   *
   * Derived rather than written back into the view: the setting is the
   * reader's, and a phone should not silently rewrite it or save it into their
   * next saved view. The Sticky Columns panel reads these same two values and
   * disables itself on compact, so the control shows what is in effect instead
   * of promising a freeze that is not happening.
   */
  const effectiveStickyStart: StickyEdge = isCompactSurface
    ? 'none'
    : view.stickyStart;
  const effectiveStickyEnd: StickyEdge = isCompactSurface
    ? 'none'
    : view.stickyEnd;

  // The checkbox column needs no mention here: the plugin pins the whole
  // contiguous run from the first column through the last key it is given, so
  // naming the first data column carries the selection column with it.
  const stickyPlugin = useTableStickyColumns<ServiceJob>({
    startKeys: stickyKeys(effectiveStickyStart, view.columnKeys, false),
    endKeys: stickyKeys(effectiveStickyEnd, view.columnKeys, true),
  });

  // --- Grouping --------------------------------------------------------------
  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(current => {
      const next = new Set(current);
      if (!next.delete(groupKey)) {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const groupBy = useCallback(
    (item: ServiceJob) => groupKeyOf(item, groupField),
    [groupField],
  );

  const getRowKey = useCallback((item: ServiceJob) => item.id, []);

  const {
    plugin: groupPlugin,
    data: groupedRows,
    idKey: groupRowKey,
  } = useTableGroupedRows<ServiceJob>({
    // The hook groups the loaded batch, and the batch always ends on a section
    // boundary, so every section it sees is entire. With grouping off it is
    // handed nothing, so it flattens nothing and its plugin goes unused.
    data: isGrouped ? rows : NO_ROWS,
    groupBy,
    collapsedGroups,
    onToggleGroup: toggleGroup,
    // No renderGroupHeader on purpose. The plugin only pins the heading to the
    // start edge for its built-in one — a custom heading is left full width,
    // which leaves a sticky element no room to travel, so chevron and label
    // scroll off a sideways-scrolled table. The default already sets the label
    // and its count in two weights, which is what a custom one was doing here.
    getRowKey,
    groupOrder: GROUP_ORDERS[groupField],
  });

  const isGroupHeaderRow = useCallback(
    (item: ServiceJob) => groupRowKey(item).startsWith(GROUP_ROW_KEY_PREFIX),
    [groupRowKey],
  );

  /**
   * A section header is a synthetic row, and the table renders every column's
   * cell against it before the plugin can discard them. Its fields read as
   * `''` there, which a cell that prints the value survives — but not the
   * commoner lookup: `STATUS_META['']` is undefined, and reading `.badge` off
   * it takes the page down. The plugin offers no way to skip those cells, so the
   * columns are wrapped to return nothing for the ones about to be thrown
   * away.
   */
  const groupedPlugin = useMemo<TablePlugin<ServiceJob>>(
    () => ({
      ...groupPlugin,
      transformColumns: cols =>
        cols.map(col => {
          const {renderCell} = col;
          return renderCell == null
            ? col
            : {
                ...col,
                renderCell: (item: ServiceJob) =>
                  isGroupHeaderRow(item) ? null : renderCell(item),
              };
        }),
    }),
    [groupPlugin, isGroupHeaderRow],
  );

  /**
   * Opens the detail panel for the clicked row. There is no first-class row
   * activation plugin, so this reaches the `<tr>` through transformBodyRow.
   */
  const rowActivationPlugin = useMemo<TablePlugin<ServiceJob>>(
    () => ({
      // The selection column ships at 36px, which centres its checkbox 6px
      // from the table edge. 48px lands it on the 16px content gutter that
      // LayoutContent gives every other first cell.
      transformColumns: cols =>
        cols.map((col, index) =>
          index === 0 && col.key === SELECTION_COLUMN_KEY
            ? {...col, width: pixel(SELECTION_COLUMN_WIDTH)}
            : col,
        ),
      transformBodyRow: (props, item) => {
        // A section header is not a row: it must never open the panel or take
        // the active highlight, and its own toggle owns the click. The
        // grouping plugin publishes no predicate for its synthetic headers, so
        // this reads the row key it documents for them.
        if (isGroupHeaderRow(item)) {
          return props;
        }
        const isActive = item.id === activeJobId;
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            tabIndex: 0,
            'aria-current': isActive ? true : undefined,
            onClick: event => {
              // Checkboxes and other cell controls own their own clicks.
              if (
                (event.target as HTMLElement).closest(
                  'input, button, a, select, textarea',
                ) != null
              ) {
                return;
              }
              setActiveJobId(item.id);
            },
            onKeyDown: event => {
              // Only when the row itself has focus, so a checkbox keeps Space.
              if (event.target !== event.currentTarget) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setActiveJobId(item.id);
              }
            },
          },
          xstyle: isActive
            ? [...props.xstyle, styles.clickableRow, styles.activeRow]
            : [...props.xstyle, styles.clickableRow],
        };
      },
    }),
    [activeJobId, isGroupHeaderRow],
  );

  const plugins = useMemo<Record<string, TablePlugin<ServiceJob>>>(
    () => ({
      selection: selectionPlugin,
      sortable: sortablePlugin,
      sticky: stickyPlugin,
      rowActivation: rowActivationPlugin,
      // Last in the record, so the header row's one full-width cell is the
      // final word on what a header renders. Left out entirely while grouping
      // is off, so the table runs the pipeline it ran before.
      ...(isGrouped ? {grouped: groupedPlugin} : null),
    }),
    [
      selectionPlugin,
      sortablePlugin,
      stickyPlugin,
      rowActivationPlugin,
      isGrouped,
      groupedPlugin,
    ],
  );

  // --- Columns ---------------------------------------------------------------
  /**
   * Compact is a one-line row, so the Job cell drops its second line and every
   * text cell clamps rather than wrapping — otherwise a long customer name
   * would out-height the row the density just tightened. `maxLines` carries its
   * own hover tooltip for whatever it cut off, which hand-rolled ellipsis
   * would not.
   */
  const isCompact = view.density === 'compact';
  const cellLines = isCompact ? 1 : 0;
  /**
   * Spacious buys the row enough height for a site photo, so the Job cell
   * leads with one. Wire the tile to your own image; the placeholder stands in
   * for it here so the row keeps the height the density promised either way.
   */
  const isSpacious = view.density === 'spacious';

  const allColumns: Record<string, TableColumn<ServiceJob>> = useMemo(
    () => ({
      summary: {
        key: 'summary',
        header: 'Job',
        width: proportional(2, {minWidth: 240}),
        sortable: true,
        renderCell: (item: ServiceJob) =>
          isCompact ? (
            <Text type="body" maxLines={1}>
              {item.summary}
            </Text>
          ) : (
            <HStack gap={3} vAlign="center">
              {isSpacious ? (
                // AspectRatio derives its height from a definite width, which
                // a flex child does not have — hence the pinned box.
                <AspectRatio
                  ratio={4 / 3}
                  fit="center"
                  xstyle={styles.jobMedia}>
                  <Icon icon={ImageIcon} size="sm" color="secondary" />
                </AspectRatio>
              ) : null}
              <VStack gap={0}>
                <Text type="body">{item.summary}</Text>
                <Text type="supporting" color="secondary">
                  {item.id}
                </Text>
              </VStack>
            </HStack>
          ),
      },
      customer: {
        key: 'customer',
        header: 'Customer',
        width: proportional(1, {minWidth: 180}),
        sortable: true,
        renderCell: (item: ServiceJob) => (
          <Text type="body" maxLines={cellLines}>
            {item.customer}
          </Text>
        ),
      },
      technician: {
        key: 'technician',
        header: 'Technician',
        width: pixel(200),
        sortable: true,
        renderCell: (item: ServiceJob) => (
          <HStack gap={2} vAlign="center">
            <Avatar name={item.technician} size="sm" />
            <Text type="body" maxLines={cellLines}>
              {item.technician}
            </Text>
          </HStack>
        ),
      },
      status: {
        key: 'status',
        header: 'Status',
        width: pixel(150),
        sortable: true,
        renderCell: (item: ServiceJob) => {
          const meta = STATUS_META[item.status];
          return <Badge variant={meta.badge} label={meta.label} />;
        },
      },
      priority: {
        key: 'priority',
        header: 'Priority',
        width: pixel(120),
        sortable: true,
        renderCell: (item: ServiceJob) => {
          const meta = PRIORITY_META[item.priority];
          return (
            <HStack gap={2} vAlign="center">
              <StatusDot
                variant={meta.dot}
                label={meta.label}
                isPulsing={item.priority === 'urgent'}
              />
              <Text type="body" maxLines={cellLines}>
                {meta.label}
              </Text>
            </HStack>
          );
        },
      },
      scheduledAt: {
        key: 'scheduledAt',
        header: 'Scheduled',
        width: pixel(160),
        sortable: true,
        renderCell: (item: ServiceJob) => (
          <Text type="body" maxLines={cellLines}>
            {formatScheduled(item.scheduledAt)}
          </Text>
        ),
      },
      quoted: {
        key: 'quoted',
        header: 'Quote',
        width: pixel(110),
        align: 'end',
        sortable: true,
        renderCell: (item: ServiceJob) => (
          <Text type="body" maxLines={cellLines}>
            {formatMoney(item.quoted)}
          </Text>
        ),
      },
      equipment: {
        key: 'equipment',
        header: 'Equipment',
        width: proportional(1, {minWidth: 200}),
        renderCell: (item: ServiceJob) => (
          <Text type="body" maxLines={cellLines}>
            {item.equipment}
          </Text>
        ),
      },
      address: {
        key: 'address',
        header: 'Address',
        width: proportional(1, {minWidth: 200}),
        renderCell: (item: ServiceJob) => (
          <Text type="body" maxLines={cellLines}>
            {item.address}
          </Text>
        ),
      },
    }),
    [cellLines, isCompact, isSpacious],
  );

  const columns = useMemo(
    () => view.columnKeys.map(key => allColumns[key]).filter(Boolean),
    [view.columnKeys, allColumns],
  );

  const selectedCount = selectedKeys.size;
  const selectedJobs = allJobs.filter(j => selectedKeys.has(j.id));
  // The search box narrows the results like any other filter, so it counts
  // towards offering Clear all — otherwise a search with no filters set leaves
  // the reader with a narrowed table and no single way back.
  const hasFilters = filters.length > 0 || query !== '';

  // Hoisted so the accessible name and the tooltip can't drift apart as the
  // mode flips.
  const powerSearchLabel = isPowerSearch
    ? 'Switch to filter tokens'
    : 'Advanced search';

  /**
   * Declared once and rendered in whichever bar is on screen: alongside the
   * filter controls it swaps, and in the toolbar while power search is up —
   * that bar has no filter row to sit in, and without it there would be no way
   * back short of picking a saved view.
   *
   * `tooltip` is stated rather than left to isIconOnly: the automatic tooltip
   * the prop documents never reaches Button, so an icon-only toggle shows
   * nothing on hover without it.
   */
  const powerSearchToggle = (
    <ToggleButton
      label={powerSearchLabel}
      tooltip={powerSearchLabel}
      isIconOnly
      size="sm"
      isPressed={isPowerSearch}
      icon={<Icon icon={SlidersHorizontal} size="sm" />}
      pressedIcon={<Icon icon={SlidersHorizontalFilled} size="sm" />}
      onPressedChange={next => setIsPowerSearch(next)}
    />
  );

  const activeJob = allJobs.find(j => j.id === activeJobId) ?? null;
  /** Other jobs at the same site, newest first — the panel's history list. */
  const siteHistory = useMemo(
    () =>
      activeJob == null
        ? []
        : allJobs
            .filter(
              j => j.customer === activeJob.customer && j.id !== activeJob.id,
            )
            .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    [activeJob],
  );

  // ---------------------------------------------------------------------------
  // Columns panel
  // ---------------------------------------------------------------------------

  /**
   * The reader's own order, which is what reordering acts on — so it is the
   * stored list, not a derived one.
   */
  const displayedColumns = view.columnKeys;

  const availableColumns = useMemo(
    () => ALL_COLUMN_KEYS.filter(k => !view.columnKeys.includes(k)),
    [view.columnKeys],
  );

  const setReorderSession = (next: ColumnReorderSession | null) => {
    reorderSessionRef.current = next;
    setReorderSessionState(next);
  };

  const commitColumnOrder = (nextKeys: readonly string[]) => {
    updateView(v => ({...v, columnKeys: [...nextKeys]}));
  };

  const moveColumn = (key: string, requestedIndex: number) => {
    const from = displayedColumns.indexOf(key);
    const to = Math.max(
      0,
      Math.min(displayedColumns.length - 1, requestedIndex),
    );
    if (from < 0 || to === from) {
      return false;
    }
    const nextKeys = [...displayedColumns];
    nextKeys.splice(from, 1);
    nextKeys.splice(to, 0, key);
    commitColumnOrder(nextKeys);
    return true;
  };

  /**
   * A click with no drag behind it picks the row up for the keyboard, and a
   * second one drops it. That gives the grip the same two-step a screen reader
   * is told about, without stranding a pointer user who clicked it by habit.
   */
  const handleGripClick = (key: string) => {
    if (suppressGripClickRef.current) {
      suppressGripClickRef.current = false;
      return;
    }
    const index = displayedColumns.indexOf(key);
    if (reorderSessionRef.current?.key === key) {
      setReorderSession(null);
      announce(
        `${COLUMN_LABELS[key]} dropped at position ${index + 1} of ${displayedColumns.length}.`,
      );
      return;
    }
    setReorderSession({
      key,
      mode: 'keyboard',
      originalKeys: [...displayedColumns],
      fromIndex: index,
      toIndex: index,
    });
    announce(
      `${COLUMN_LABELS[key]} picked up, position ${index + 1} of ${displayedColumns.length}. Use the arrow keys to move it, Space or Enter to drop, or Escape to cancel.`,
    );
  };

  const handleGripKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    const session = reorderSessionRef.current;
    if (event.key === 'Escape' && session?.key === key) {
      // Escape is the popover's own close key, so a cancel has to end here or
      // the panel disappears out from under the row being put back.
      event.preventDefault();
      event.stopPropagation();
      // Only write if something actually moved: updateView steps off the
      // active saved view, and abandoning a pick-up has changed nothing.
      if (
        session.originalKeys.join() !== displayedColumns.join() &&
        displayedColumns.includes(key)
      ) {
        commitColumnOrder(session.originalKeys);
      }
      setReorderSession(null);
      announce(`${COLUMN_LABELS[key]} move cancelled.`);
      return;
    }
    const index = displayedColumns.indexOf(key);
    const targets: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: displayedColumns.length - 1,
    };
    const target = targets[event.key];
    if (target == null) {
      return;
    }
    // Arrow keys move the row whether or not it has been picked up first: the
    // pick-up is what a screen reader is offered, not a gate on the shortcut.
    event.preventDefault();
    if (moveColumn(key, target)) {
      announce(
        `${COLUMN_LABELS[key]}, position ${Math.max(0, Math.min(displayedColumns.length - 1, target)) + 1} of ${displayedColumns.length}.`,
      );
    }
  };

  const handleGripPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: string,
  ) => {
    if (event.button !== 0 || columnRowRefs.current.get(key) == null) {
      return;
    }
    suppressGripClickRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const index = displayedColumns.indexOf(key);
    setReorderSession({
      key,
      mode: 'pointer',
      originalKeys: [...displayedColumns],
      fromIndex: index,
      toIndex: index,
      pointerId: event.pointerId,
      pointerStartY: event.clientY,
      hasPointerMoved: false,
    });
  };

  const handleGripPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const session = reorderSessionRef.current;
    if (session?.mode !== 'pointer' || session.pointerId !== event.pointerId) {
      return;
    }
    const travel = Math.abs(event.clientY - (session.pointerStartY ?? 0));
    if (session.hasPointerMoved !== true && travel < REORDER_DRAG_THRESHOLD) {
      return;
    }
    // The dragged row is still in the list at its old height, so the insertion
    // point is measured against the rows that would remain without it.
    const remaining = session.originalKeys.filter(k => k !== session.key);
    let toIndex = remaining.length;
    for (let i = 0; i < remaining.length; i += 1) {
      const row = columnRowRefs.current.get(remaining[i]);
      if (row == null) {
        continue;
      }
      const bounds = row.getBoundingClientRect();
      if (event.clientY < bounds.top + bounds.height / 2) {
        toIndex = i;
        break;
      }
    }
    if (session.hasPointerMoved === true && session.toIndex === toIndex) {
      return;
    }
    setReorderSession({...session, hasPointerMoved: true, toIndex});
  };

  const handleGripPointerEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const session = reorderSessionRef.current;
    if (session?.mode !== 'pointer' || session.pointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    setReorderSession(null);
    // A press that never travelled is a click, not a drag — let it through so
    // the grip still picks up for the keyboard.
    if (cancelled || session.hasPointerMoved !== true) {
      suppressGripClickRef.current = false;
      return;
    }
    // The click lands after this handler, so the flag has to outlive the turn.
    setTimeout(() => {
      suppressGripClickRef.current = false;
    }, 0);
    if (session.toIndex === session.fromIndex) {
      return;
    }
    const nextKeys = [...session.originalKeys];
    nextKeys.splice(session.fromIndex, 1);
    nextKeys.splice(session.toIndex, 0, session.key);
    commitColumnOrder(nextKeys);
    announce(
      `${COLUMN_LABELS[session.key]} dropped at position ${session.toIndex + 1} of ${session.originalKeys.length}.`,
    );
  };

  /**
   * Which row the insertion rule hangs off, and on which side. Suppressed while
   * the drop would land where the row already is, so a drag that has gone
   * nowhere does not draw a line promising a move.
   */
  const columnDropPlacement = useMemo(() => {
    if (
      reorderSession?.mode !== 'pointer' ||
      reorderSession.hasPointerMoved !== true ||
      reorderSession.toIndex === reorderSession.fromIndex
    ) {
      return null;
    }
    const remaining = reorderSession.originalKeys.filter(
      k => k !== reorderSession.key,
    );
    const before = remaining[reorderSession.toIndex];
    if (before != null) {
      return {key: before, position: 'before' as const};
    }
    const after = remaining[remaining.length - 1];
    return after == null ? null : {key: after, position: 'after' as const};
  }, [reorderSession]);

  // ---------------------------------------------------------------------------
  // Filter bar pieces
  // ---------------------------------------------------------------------------

  const renderFilterControl = (field: FilterField) => {
    const active = filters.find(f => f.field === field.key);
    const value = active
      ? String((active.value as {value?: unknown}).value ?? '')
      : '';

    return (
      <Selector
        key={field.key}
        label={`${field.label} filter`}
        isLabelHidden
        // Unset the trigger reads as the bare field name; set, renderValue
        // expands it to the whole clause, so the closed trigger stays the chip.
        placeholder={field.label}
        size="sm"
        hasClear
        options={[...field.options]}
        value={value === '' ? null : value}
        renderValue={option =>
          `${field.label} ${field.operatorLabel} ${option.label ?? option.value}`
        }
        controlXstyle={active ? styles.filterFill : undefined}
        onChange={next =>
          setFieldFilter(
            field.key,
            next == null || next === ''
              ? null
              : {
                  field: field.key,
                  operator: field.operator,
                  value:
                    field.valueType === 'integer'
                      ? {type: 'integer', value: Number(next)}
                      : {type: 'enum', value: next},
                },
          )
        }
      />
    );
  };

  /**
   * One flat array rather than inline JSX: OverflowList hands its renderer the
   * *indices* of the clauses it had to hide, so the row and the overflow menu
   * have to be reading from the same list for those indices to mean anything.
   */
  const filterControls = [
    ...PRESET_FILTERS.map(preset => {
      const isPressed = filters.some(
        f => JSON.stringify(f) === JSON.stringify(preset.filter),
      );
      return (
        <ToggleButton
          key={preset.key}
          label={preset.label}
          size="sm"
          isPressed={isPressed}
          // ToggleButton is a ghost Button underneath, so unpressed it has no
          // chrome at all; the border is what puts it in the same family as
          // the unset selectors. Pressed, its own overlay supplies the fill.
          xstyle={[
            styles.filterChrome,
            isPressed ? styles.filterLabelValue : styles.filterLabelEmpty,
            !isPressed && styles.filterSurface,
          ]}
          onPressedChange={() => togglePreset(preset.filter)}
        />
      );
    }),
    ...MULTI_FILTER_FIELDS.map(field => (
      <MultiSelector
        key={field.key}
        label={`${field.label} filter`}
        isLabelHidden
        placeholder={field.label}
        size="sm"
        hasClear
        triggerDisplay="labels"
        // labels mode spells out three before it counts, which is right for a
        // selector with a row to itself and wrong here: three filters each
        // three labels wide push the rest of the bar into the overflow menu.
        // One name and a count keeps every filter on the row and still says
        // which filter it is.
        formatValue={items =>
          items.length > 1
            ? `${items[0].label}, +${items.length - 1}`
            : items[0].label
        }
        options={[...field.options]}
        value={multiValues[field.key]}
        controlXstyle={
          multiValues[field.key].length > 0 ? styles.filterFill : undefined
        }
        onChange={next => setMultiValues(field.key, next)}
      />
    )),
    ...FILTER_FIELDS.map(renderFilterControl),
    // Quote is a range, not a one-of-many pick, so it takes the shell built
    // for custom selection surfaces: ComplexSelector owns the same field,
    // trigger and popover anatomy the selectors beside it use, and the slider
    // owns only its own content. `value` is the draft rather than the
    // committed range — dragging has to move the track, and the filter array
    // is not written until the thumb is released.
    <ComplexSelector<[number, number]>
      key="quote"
      label="Quote filter"
      isLabelHidden
      placeholder="Quote"
      triggerLabel={quoteLabel}
      size="sm"
      value={quoteDraft}
      onChange={commitQuote}
      contentXstyle={styles.quotePopover}
      controlXstyle={hasQuoteFilter ? styles.filterFill : undefined}>
      {(range, onChange, close) => (
        <VStack gap={4}>
          <VStack gap={0}>
            <Text type="label">Quote range</Text>
            <Text type="large" hasTabularNumbers>
              {formatMoney(range[0])} – {formatMoney(range[1])}
            </Text>
          </VStack>

          <VStack gap={1}>
            <Slider
              label="Quote range"
              isLabelHidden
              value={range}
              min={QUOTE_MIN}
              max={QUOTE_MAX}
              step={QUOTE_STEP}
              valueDisplay="none"
              formatValue={formatMoney}
              minStepsBetweenThumbs={1}
              width="100%"
              onChange={setQuoteDraft}
              onChangeEnd={onChange}
            />
            {/* The bounds are their own row rather than Slider `marks`:
                  mark labels are absolutely positioned and contribute no
                  height, so they hang into whatever follows the track. */}
            <HStack hAlign="between" vAlign="center">
              <Text type="supporting" color="secondary">
                {formatMoney(QUOTE_MIN)}
              </Text>
              <Text type="supporting" color="secondary">
                {formatMoney(QUOTE_MAX)}
              </Text>
            </HStack>
          </VStack>

          <Divider />

          {/* ComplexSelector has no `hasClear`, so unlike the selectors
                beside it the clear lives in the surface rather than the
                trigger. */}
          <HStack gap={2} hAlign="between" vAlign="center">
            <Button
              label="Clear"
              variant="ghost"
              size="sm"
              isDisabled={!hasQuoteFilter}
              onClick={() => onChange([QUOTE_MIN, QUOTE_MAX])}
            />
            <Button
              label="Done"
              variant="secondary"
              size="sm"
              onClick={close}
            />
          </HStack>
        </VStack>
      )}
    </ComplexSelector>,
  ];

  const filterBar = (
    <HStack
      gap={2}
      vAlign="center"
      wrap="nowrap"
      minHeight={32}
      xstyle={styles.filterRow}>
      {/* Search leads the row: it is the broadest filter, and anchoring it at
          the start keeps a fixed-width control on the first line. It sits
          outside the overflow list so it is never the clause that collapses —
          a hidden search box reads as a missing feature, not a folded one. */}
      <StackItem xstyle={styles.searchSlot}>
        <TextInput
          label="Search jobs"
          isLabelHidden
          placeholder="Job name"
          size="sm"
          width="100%"
          value={query}
          onChange={setQuery}
          startIcon={Search}
        />
      </StackItem>

      {/* The slot, not the list, is what carries the sizing. A list that reads
          its own width is reading the thing it just changed — collapse a
          clause and the measurement shrinks with it — so `observeParent` sends
          it up here instead, and this wrapper is then the piece that has to be
          sized right: from the row, never from the clauses inside it. See
          filterOverflowSlot for what that takes and what it looked like when
          the wrapper was content-sized too.

          The readout lives in here with the list for the same reason, so that
          sizing this wrapper from the row does not drag the readout out to the
          row's edge with it. */}
      <StackItem xstyle={styles.filterOverflowSlot}>
        <OverflowList
          behavior="observeParent"
          gap={2}
          /* One clause stays on the row where there is width for it: a bar
             that collapses to nothing but a count reads as though the filters
             are gone rather than folded. A phone has no such width — search,
             one clause and the readout do not fit across 393px — so there the
             floor comes off and the whole set folds behind the count. */
          minVisibleItems={isCompactSurface ? 0 : 1}
          overflowRenderer={overflowItems => (
            <FilterOverflow
              items={overflowItems}
              isCompactSurface={isCompactSurface}
            />
          )}>
          {filterControls}
        </OverflowList>

        {/* The row's readout, kept as one group directly after the last clause
            rather than pushed to the far edge. Grouping also stops the
            separator stranding itself on a line of its own.

            Inside the slot rather than beside it: a sibling would sit after
            the slot, and the slot spans the row's leftover, so the readout
            would land at the trailing edge however few clauses were showing.
            In here it follows the clauses, and the reserve is what stops the
            list from spending the width it needs. */}
        <HStack gap={2} vAlign="center" xstyle={styles.filterMeta}>
          {powerSearchToggle}

          <Text type="supporting" color="secondary">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </Text>

          {hasFilters && (
            <>
              <Text type="supporting" color="secondary">
                •
              </Text>
              {/* Href-less, so Link renders a <button>: this resets the filter
                  array, it does not navigate. */}
              <Link type="supporting" onClick={clearAll}>
                Clear all
              </Link>
            </>
          )}
        </HStack>
      </StackItem>
    </HStack>
  );

  const savedViewsBar = (
    <HStack
      gap={2}
      vAlign="center"
      wrap="nowrap"
      minHeight={32}
      xstyle={styles.bar}>
      {/* Outside the scroller, so the row keeps saying what it is however far
          the chips are pushed along. */}
      <Text type="label" xstyle={styles.savedViewsLabel}>
        Saved views:
      </Text>
      {/* Same slot-and-content split the filter row uses, for the same reason:
          the slot is the piece that shrinks, and the scroller inside reads the
          width it is left with. Scrolled rather than folded into a count,
          unlike the clauses — a saved view is picked by recognising its name,
          so a set that hides behind "+3" cannot be browsed, only counted. */}
      <StackItem xstyle={styles.savedViewsSlot}>
        <HStack
          gap={2}
          vAlign="center"
          wrap="nowrap"
          xstyle={styles.savedViewsScroller}>
          {/* Exactly one of these is engaged at a time, so All is a member of
              the same group rather than a differently-shaped reset button. It
              carries no icon because it stands for the absence of a saved
              view. */}
          <ToggleButton
            label="All"
            size="sm"
            isPressed={activeSavedViewId == null}
            xstyle={[
              styles.savedViewChip,
              styles.filterChrome,
              activeSavedViewId == null
                ? styles.filterLabelValue
                : styles.filterLabelEmpty,
              activeSavedViewId != null && styles.filterSurface,
            ]}
            onPressedChange={() => applySavedView(null)}
          />
          {savedViews.map(saved => {
            const isPressed = activeSavedViewId === saved.id;
            return (
              <ToggleButton
                key={saved.id}
                label={saved.name}
                size="sm"
                isPressed={isPressed}
                icon={<Icon icon={Bookmark} size="sm" />}
                // Same chrome the filter-bar presets wear: a ghost Button has
                // none unpressed, and the border is what keeps these in the
                // same family as the unset selectors in the row above.
                xstyle={[
                  styles.savedViewChip,
                  styles.filterChrome,
                  isPressed ? styles.filterLabelValue : styles.filterLabelEmpty,
                  !isPressed && styles.filterSurface,
                ]}
                // Unpressing lands on the state the All chip already models:
                // applySavedView(null) drops the active id and its filters
                // together, so the two controls can never disagree about what
                // is applied.
                onPressedChange={next => applySavedView(next ? saved : null)}
              />
            );
          })}
          {activeSavedViewId != null && (
            <IconButton
              label="Edit saved view"
              tooltip="Edit saved view"
              variant="ghost"
              size="sm"
              icon={<Icon icon={Pencil} size="sm" />}
              xstyle={styles.savedViewChip}
              onClick={() => {
                const found = savedViews.find(s => s.id === activeSavedViewId);
                if (found) {
                  setEditing({...found});
                }
              }}
            />
          )}
        </HStack>
      </StackItem>
    </HStack>
  );

  const bulkBar = (
    <Section
      variant="muted"
      paddingInline={3}
      paddingBlock={1.5}
      xstyle={[styles.bulkBand, styles.bulkBandEnter]}>
      <HStack
        gap={3}
        vAlign="center"
        wrap="wrap"
        minHeight={32}
        xstyle={styles.bar}>
        <StackItem size="fill">
          <HStack gap={1} vAlign="center">
            {BULK_EDIT_ACTIONS.map(action => (
              <Button
                key={action.key}
                label={action.label}
                variant="ghost"
                size="sm"
                icon={action.icon}
                onClick={() => action.onClick(selectedJobs)}
              />
            ))}
          </HStack>
        </StackItem>

        {/* Grouped so the separator can't strand itself on a line of its own
            once the actions grow wide enough to break the bar. */}
        <HStack gap={3} vAlign="center">
          <Text type="body">
            {selectedCount} {selectedCount === 1 ? 'job' : 'jobs'} selected
          </Text>
          <Text type="supporting" color="secondary">
            •
          </Text>
          <Button
            label="Unselect All"
            variant="ghost"
            size="sm"
            onClick={() => setSelectedKeys(new Set())}
          />
        </HStack>
      </HStack>
    </Section>
  );

  // ---------------------------------------------------------------------------
  // View options panel
  // ---------------------------------------------------------------------------

  const viewPanelBody = () => {
    switch (viewSection) {
      case 'columns':
        return (
          <VStack gap={0} minHeight={0} xstyle={styles.transferRoot}>
            {/* No column preset here: a saved view stores the whole view
                configuration, columns included, so a second preset picker
                scoped to columns alone would be a rival source of truth.
                No search either: both panels together hold the full column
                set, which is short enough to read at a glance. */}
            <VisuallyHidden id={`${columnPanelId}-reorder-hint`}>
              Press Space or Enter to pick up a column. Use the arrow keys to
              move it, Space or Enter to drop, or Escape to cancel.
            </VisuallyHidden>

            <HStack gap={0} minHeight={0} xstyle={styles.transferPanels}>
              <VStack
                gap={0}
                role="group"
                aria-labelledby={`${columnPanelId}-displayed`}
                xstyle={styles.transferPanel}>
                <HStack
                  gap={2}
                  vAlign="center"
                  hAlign="between"
                  paddingBlock={2}
                  xstyle={[
                    styles.transferPanelHeader,
                    styles.transferPadStart,
                  ]}>
                  <Text
                    id={`${columnPanelId}-displayed`}
                    type="label"
                    color="secondary">
                    Displayed columns
                  </Text>
                  <Button
                    label="Restore"
                    variant="ghost"
                    size="sm"
                    xstyle={styles.transferHeaderAction}
                    onClick={() =>
                      updateView(v => ({
                        ...v,
                        columnKeys: DEFAULT_COLUMN_KEYS,
                      }))
                    }
                  />
                </HStack>
                <VStack gap={0} xstyle={styles.transferPanelBody}>
                  {displayedColumns.length === 0 ? (
                    <VStack
                      gap={0}
                      vAlign="center"
                      hAlign="center"
                      minHeight="100%"
                      paddingBlock={4}
                      xstyle={[styles.transferEmpty, styles.transferPadStart]}>
                      <Text type="supporting" color="secondary">
                        No columns are displayed.
                      </Text>
                    </VStack>
                  ) : (
                    <List
                      density="compact"
                      header={
                        <VisuallyHidden>Displayed columns</VisuallyHidden>
                      }>
                      {displayedColumns.map(key => {
                        const isLocked = key === LOCKED_COLUMN_KEY;
                        const isPicked =
                          reorderSession?.key === key &&
                          reorderSession.mode === 'keyboard';
                        const isDragging =
                          reorderSession?.key === key &&
                          reorderSession.mode === 'pointer' &&
                          reorderSession.hasPointerMoved === true;
                        const drop =
                          columnDropPlacement?.key === key
                            ? columnDropPlacement.position
                            : null;
                        return (
                          <Item
                            key={key}
                            as="li"
                            density="compact"
                            ref={node => {
                              if (node == null) {
                                columnRowRefs.current.delete(key);
                              } else {
                                columnRowRefs.current.set(key, node);
                              }
                            }}
                            label={COLUMN_LABELS[key]}
                            startContent={
                              <IconButton
                                label={`Reorder ${COLUMN_LABELS[key]}`}
                                aria-describedby={`${columnPanelId}-reorder-hint`}
                                aria-pressed={isPicked}
                                variant="ghost"
                                size="sm"
                                icon={<Icon icon={GripVertical} size="sm" />}
                                xstyle={[
                                  styles.transferGrip,
                                  reorderStyles.handle,
                                  (isPicked || isDragging) &&
                                    reorderStyles.handleActive,
                                ]}
                                onClick={() => handleGripClick(key)}
                                onKeyDown={event =>
                                  handleGripKeyDown(event, key)
                                }
                                onPointerDown={event =>
                                  handleGripPointerDown(event, key)
                                }
                                onPointerMove={handleGripPointerMove}
                                onPointerUp={event =>
                                  handleGripPointerEnd(event, false)
                                }
                                onPointerCancel={event =>
                                  handleGripPointerEnd(event, true)
                                }
                                onLostPointerCapture={event =>
                                  handleGripPointerEnd(event, true)
                                }
                              />
                            }
                            endContent={
                              <IconButton
                                label={`Remove ${COLUMN_LABELS[key]}`}
                                variant="ghost"
                                size="sm"
                                isDisabled={isLocked}
                                // A control that refuses without saying why is
                                // a dead end; the tooltip is the explanation.
                                tooltip={
                                  isLocked ? LOCKED_COLUMN_MESSAGE : undefined
                                }
                                icon={<Icon icon={X} size="sm" />}
                                xstyle={styles.transferEndAction}
                                onClick={() =>
                                  updateView(v => ({
                                    ...v,
                                    columnKeys: v.columnKeys.filter(
                                      k => k !== key,
                                    ),
                                  }))
                                }
                              />
                            }
                            xstyle={[
                              styles.transferItem,
                              styles.transferPadStart,
                              isPicked && styles.transferItemPicked,
                              isDragging && reorderStyles.source,
                              drop === 'before' && reorderStyles.dropBefore,
                              drop === 'after' && reorderStyles.dropAfter,
                            ]}
                          />
                        );
                      })}
                    </List>
                  )}
                </VStack>
              </VStack>

              <VStack
                gap={0}
                role="group"
                aria-labelledby={`${columnPanelId}-available`}
                xstyle={[styles.transferPanel, styles.transferPanelDivider]}>
                <HStack
                  gap={2}
                  vAlign="center"
                  hAlign="between"
                  paddingBlock={2}
                  xstyle={[styles.transferPanelHeader, styles.transferPadEnd]}>
                  <Text
                    id={`${columnPanelId}-available`}
                    type="label"
                    color="secondary">
                    Available columns
                  </Text>
                  <Button
                    label="Select all"
                    variant="ghost"
                    size="sm"
                    xstyle={styles.transferHeaderAction}
                    isDisabled={
                      view.columnKeys.length === ALL_COLUMN_KEYS.length
                    }
                    onClick={() =>
                      updateView(v => ({
                        ...v,
                        // Appended, not re-sorted: a bulk add is still an add,
                        // and it has no business restating the reader's order.
                        columnKeys: [
                          ...v.columnKeys,
                          ...ALL_COLUMN_KEYS.filter(
                            k => !v.columnKeys.includes(k),
                          ),
                        ],
                      }))
                    }
                  />
                </HStack>
                <VStack gap={0} xstyle={styles.transferPanelBody}>
                  {availableColumns.length === 0 ? (
                    <VStack
                      gap={0}
                      vAlign="center"
                      hAlign="center"
                      minHeight="100%"
                      paddingBlock={4}
                      xstyle={[styles.transferEmpty, styles.transferPadEnd]}>
                      <Text type="supporting" color="secondary">
                        All columns are displayed.
                      </Text>
                    </VStack>
                  ) : (
                    <List
                      density="compact"
                      header={
                        <VisuallyHidden>Available columns</VisuallyHidden>
                      }>
                      {availableColumns.map(key => (
                        <Item
                          key={key}
                          as="li"
                          density="compact"
                          label={COLUMN_LABELS[key]}
                          endContent={
                            <IconButton
                              label={`Add ${COLUMN_LABELS[key]}`}
                              variant="ghost"
                              size="sm"
                              icon={<Icon icon={Plus} size="sm" />}
                              xstyle={styles.transferEndAction}
                              onClick={() =>
                                updateView(v => ({
                                  ...v,
                                  // Appended rather than slotted back into
                                  // canonical order: the reader's own ordering
                                  // is the thing being edited, and re-sorting
                                  // here would silently discard it every time a
                                  // column came back.
                                  columnKeys: [...v.columnKeys, key],
                                }))
                              }
                            />
                          }
                          xstyle={[styles.transferItem, styles.transferPadEnd]}
                        />
                      ))}
                    </List>
                  )}
                </VStack>
              </VStack>
            </HStack>
          </VStack>
        );

      case 'density':
        return (
          <VStack gap={0} paddingInline={4} paddingBlockEnd={4}>
            <RadioList
              label="Density"
              isLabelHidden
              value={view.density}
              onChange={value =>
                updateView(v => ({...v, density: value as Density}))
              }>
              {DENSITY_OPTIONS.map(option => (
                <RadioListItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </RadioList>
          </VStack>
        );

      case 'sticky':
        return (
          <VStack gap={4} paddingInline={4} paddingBlockEnd={4}>
            {/* Both groups read the effective value, not the stored one, and
                go disabled where the two differ — a radio still sitting on
                "First column" while nothing is frozen is the control lying
                about the table. `disabledMessage` is what says why, and it is
                the sanctioned way to do it here: a disabled control swallows
                the hover a wrapping Tooltip would need. */}
            <RadioList
              label="First columns"
              value={effectiveStickyStart}
              isDisabled={isCompactSurface}
              disabledMessage="Freezing is off on a narrow screen: a pinned column would leave too little width to scroll the rest."
              onChange={value =>
                updateView(v => ({...v, stickyStart: value as StickyEdge}))
              }>
              {STICKY_START_OPTIONS.map(option => (
                <RadioListItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </RadioList>
            <RadioList
              label="Last columns"
              value={effectiveStickyEnd}
              isDisabled={isCompactSurface}
              disabledMessage="Freezing is off on a narrow screen: a pinned column would leave too little width to scroll the rest."
              onChange={value =>
                updateView(v => ({...v, stickyEnd: value as StickyEdge}))
              }>
              {STICKY_END_OPTIONS.map(option => (
                <RadioListItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </RadioList>
          </VStack>
        );

      case 'grouping':
        return (
          <VStack gap={0} paddingInline={4} paddingBlockEnd={4}>
            <RadioList
              label="Grouping"
              isLabelHidden
              value={view.grouping}
              onChange={value =>
                updateView(v => ({...v, grouping: value as GroupField}))
              }>
              {GROUPING_OPTIONS.map(option => (
                <RadioListItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </RadioList>
          </VStack>
        );
    }
  };

  const activeSection = VIEW_SECTIONS.find(s => s.key === viewSection);

  /**
   * Flat rather than outlined: ghost is the borderless variant Button and
   * Selector share, so this trigger reads as the same family of control as a
   * ghost Selector — chevron and all — without the local filterChrome the
   * bordered toggles in the row need.
   *
   * Deliberately not a ComplexSelector, unlike the Quote control: this panel
   * drives a whole ViewState and has no single value to hand a value-shaped
   * component.
   *
   * As a Popover's child the click is the Popover's to handle, so `onClick` is
   * only wired on the branch where this button owns the open state itself.
   */
  const viewOptionsTrigger = (
    <Button
      label="View options"
      variant="ghost"
      size="sm"
      endContent={<Icon icon={ChevronDown} size="sm" />}
      onClick={isCompactSurface ? () => setIsViewOpen(true) : undefined}
    />
  );

  /**
   * The popover container is flush (see styles.viewPopoverSurface), so the
   * rail's divider runs the full height of the body. Nothing sits against a
   * popover edge: the rail and the pane each carry their own gutter.
   */
  const viewOptionsPopover = (
    <VStack gap={0}>
      <HStack gap={0} xstyle={styles.viewPopover}>
        <Section
          variant="transparent"
          padding={1}
          dividers={['end']}
          xstyle={styles.viewRail}>
          <VStack gap={1}>
            {VIEW_SECTIONS.map(section => (
              <Button
                key={section.key}
                label={section.label}
                variant={viewSection === section.key ? 'secondary' : 'ghost'}
                icon={section.icon}
                xstyle={styles.railItem}
                onClick={() => setViewSection(section.key)}
              />
            ))}
          </VStack>
        </Section>

        <StackItem size="fill">
          {/* A stack rather than a Section: the pane carries no gutter of its
              own, so a child can run a rule the full width of it rather than
              stopping at a gutter it does not own, and everything that is not
              a divider re-states the 16px itself. That leaves Section with
              nothing to contribute here but an inner display:block wrapper,
              which is exactly what would stop the panels below from taking
              the pane's full height. */}
          <VStack gap={0} minHeight={0} xstyle={styles.viewPanel}>
            {/* The pane's gutter, restated here because the container carries
                none — that is what lets a rule below reach both edges. */}
            <VStack gap={0} padding={4} paddingBlockEnd={3}>
              <Heading level={3}>{activeSection?.title}</Heading>
            </VStack>

            {viewPanelBody()}
          </VStack>
        </StackItem>
      </HStack>
    </VStack>
  );

  /**
   * The same four sections on a phone, where the popover's shape is the thing
   * that fails: 660px of rail-beside-pane squeezed into 393px leaves the
   * column lists about 75px each, which is narrower than the words in them.
   *
   * The rail turns horizontal and becomes a TabList, which is the component
   * that already owns this: a strip narrower than its tabs scrolls, the
   * selected one is kept in view, and the edge fade says there is more. That
   * last part is why this is a strip and not a wrap — a bare scroller would
   * hide sections behind a gesture with nothing on screen to suggest it, and
   * the fade is the affordance that answers it. Below it the pane gets the
   * full width, which is what the column lists needed.
   *
   * `overflow` is left at its default rather than pinned to 'scroll': 'auto'
   * is the component choosing, so a future strip that folds into a menu
   * instead reaches this template without an edit here.
   *
   * `role="tablist"` rather than the default nav landmark: these tabs swap a
   * panel in place instead of navigating, so each one points at the panel via
   * panelId and the panel answers to it below.
   *
   * `tall` rather than `capped`: Columns is a two-panel transfer list, and the
   * mid-height budget would spend most of itself on the rail and heading and
   * leave a few rows visible under them.
   */
  const viewOptionsSheet = (
    <BottomSheet
      // The popover and the sheet read the same open flag, so the branch has
      // to be in the condition: without it, opening the panel with a pointer
      // would raise the sheet behind the popover as well.
      isOpen={isCompactSurface && isViewOpen}
      onOpenChange={setIsViewOpen}
      label="View options"
      height="tall"
      // The tab strip compensates against a container inset, so the sheet
      // publishes none and the wrapper below owns the top band.
      padding={0}>
      {/* The inset is the wrapper's, so the strip's own box starts at the tab
          row and its scroll arrow lands on the tabs rather than above them. */}
      <VStack gap={0} paddingBlockStart={SHEET_TOP_INSET}>
        {/* The heading the popover puts above the pane is dropped here: it
            restates the selected tab word for word, and the strip already
            marks which one that is. On a phone that is a line of vertical
            space spent saying it twice. The panel keeps the name for anyone
            not seeing the strip: its selected tab labels it. */}
        <TabList
          value={viewSection}
          onChange={value => setViewSection(value as ViewSection)}
          role="tablist"
          hasDivider
          xstyle={styles.viewSheetTabs}>
          {VIEW_SECTIONS.map(section => (
            <Tab
              key={section.key}
              id={`${viewPanelId}-tab-${section.key}`}
              value={section.key}
              label={section.label}
              icon={section.icon}
              panelId={viewPanelId}
            />
          ))}
        </TabList>

        {/* The panels set their own inline gutter and bottom padding but no
            top one, because in the popover the dropped heading was the thing
            separating them from what is above. Here the strip's rule takes
            that place, so the gap it left is restated at the same 12px the
            heading gave it. */}
        <VStack
          gap={0}
          id={viewPanelId}
          role="tabpanel"
          aria-labelledby={`${viewPanelId}-tab-${viewSection}`}
          paddingBlockStart={3}>
          {viewPanelBody()}
        </VStack>
      </VStack>
    </BottomSheet>
  );

  // ---------------------------------------------------------------------------
  // Detail panel
  // ---------------------------------------------------------------------------

  /**
   * The panel's contents, held apart from the panel itself so the sheet can
   * show the same thing. Nothing in here is aware of which one it is in: it is
   * a column of sections against a 16px gutter either way, and both hosts
   * carry no padding of their own for it to fight.
   */
  const detailBody =
    activeJob == null ? null : (
      <VStack gap={0} xstyle={styles.detailPanel}>
        {/* The only part of the body that knows which host it is in: the sheet
            needs the pill cleared, the docked panel has no pill and would just
            sit 8px lower than the panels beside it. The two never coexist —
            Layout drops the panel entirely on a compact surface. */}
        <Section
          variant="transparent"
          padding={4}
          paddingBlockStart={isCompactSurface ? SHEET_TOP_INSET : 4}>
          <VStack gap={4}>
            <HStack gap={2}>
              <StackItem size="fill">
                <VStack gap={2}>
                  <HStack gap={2} vAlign="center">
                    <Badge
                      variant={STATUS_META[activeJob.status].badge}
                      label={STATUS_META[activeJob.status].label}
                    />
                    <StatusDot
                      variant={PRIORITY_META[activeJob.priority].dot}
                      label={`${PRIORITY_META[activeJob.priority].label} priority`}
                      isPulsing={activeJob.priority === 'urgent'}
                    />
                    <Text type="supporting" color="secondary">
                      {PRIORITY_META[activeJob.priority].label} · {activeJob.id}
                    </Text>
                  </HStack>
                  <Heading level={2}>{activeJob.summary}</Heading>
                </VStack>
              </StackItem>
              <IconButton
                label="Close details"
                variant="ghost"
                size="sm"
                icon={<Icon icon={X} size="sm" />}
                onClick={() => setActiveJobId(null)}
              />
            </HStack>

            {/* Both take the full width, so flex shrink splits the row
                  evenly however wide the panel is dragged. */}
            <HStack gap={2}>
              <Button
                label={NEXT_ACTION[activeJob.status]}
                size="sm"
                width="100%"
              />
              <Button
                label="Edit job"
                variant="secondary"
                size="sm"
                width="100%"
              />
            </HStack>
          </VStack>
        </Section>

        <Divider />

        <Section variant="transparent" padding={4}>
          <MetadataList
            columns="single"
            label={{position: 'start', width: 104}}>
            <MetadataListItem label="Customer">
              <Text type="body">{activeJob.customer}</Text>
            </MetadataListItem>
            <MetadataListItem label="Site address">
              <Text type="body">{activeJob.address}</Text>
            </MetadataListItem>
            <MetadataListItem label="Technician">
              <Text type="body">{activeJob.technician}</Text>
            </MetadataListItem>
            <MetadataListItem label="Scheduled">
              <Text type="body">
                {formatDate(activeJob.scheduledAt, true)},{' '}
                {formatTime(activeJob.scheduledAt)}
              </Text>
            </MetadataListItem>
            <MetadataListItem label="Equipment">
              <Text type="body">{activeJob.equipment}</Text>
            </MetadataListItem>
            <MetadataListItem label="Quote">
              <Text type="body">{formatMoney(activeJob.quoted)}</Text>
            </MetadataListItem>
          </MetadataList>
        </Section>

        <Divider />

        <Section variant="transparent" padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Site history</Heading>
            {siteHistory.length === 0 ? (
              <Text type="supporting" color="secondary">
                No other visits on file for this site.
              </Text>
            ) : (
              <VStack gap={0}>
                {siteHistory.map(related => (
                  <Item
                    key={related.id}
                    align="center"
                    label={related.summary}
                    labelLines={2}
                    // The date leads: this is a list of visits to one site,
                    // so when it happened is what tells them apart. The
                    // badge takes the end slot the date used to hold —
                    // a badge is too wide to lead a row this narrow.
                    description={`${formatDate(related.scheduledAt, true)} · ${related.technician}`}
                    endContent={
                      <Badge
                        variant={STATUS_META[related.status].badge}
                        label={STATUS_META[related.status].label}
                      />
                    }
                    onClick={() => setActiveJobId(related.id)}
                  />
                ))}
              </VStack>
            )}
          </VStack>
        </Section>
      </VStack>
    );

  /**
   * With a pointer the details are a resizable column beside the table, so the
   * row and its detail stay on screen together and the reader can widen one
   * against the other.
   *
   * A phone has no width to give: the same panel there would leave the table
   * as a sliver of checkboxes behind it, which is what it did before this
   * branch existed. A sheet takes the block axis instead — the axis a phone
   * has to spare — so the table stays whole underneath and the details come
   * back down with a swipe.
   */
  const detailPanel =
    detailBody == null ? undefined : (
      <>
        {/* The panel owns the separator, so the handle stays divider-less and
            hides its pill at rest rather than floating a stray stub. */}
        <ResizeHandle
          resizable={detailWidth.props}
          isReversed
          isAlwaysVisible={false}
          label="Resize job details"
        />
        {/* Panel padding is 0 so the dividers reach both edges; each section
            inside re-adds the 16px gutter to keep its content on the same
            line. */}
        <LayoutPanel
          resizable={detailWidth.props}
          hasDivider
          padding={0}
          label="Job details">
          {detailBody}
        </LayoutPanel>
      </>
    );

  /**
   * `tall` because this is the reading surface, not a picker: the metadata
   * list and the site history below it are what the reader opened the row for,
   * and a mid-height budget would put the history under a scroll before they
   * had seen there was any.
   */
  const detailSheet = (
    <BottomSheet
      isOpen={isCompactSurface && activeJob != null}
      onOpenChange={open => !open && setActiveJobId(null)}
      label="Job details"
      height="tall"
      padding={0}>
      {detailBody}
    </BottomSheet>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Layout
        height="fill"
        padding={0}
        xstyle={styles.pageShell}
        end={isCompactSurface ? undefined : detailPanel}
        header={
          <LayoutHeader hasDivider label="Job filters and table actions">
            <VStack gap={0} xstyle={styles.headerWrap}>
              {isLoading && (
                <ProgressBar
                  label="Loading jobs"
                  isLabelHidden
                  isIndeterminate
                  xstyle={styles.progress}
                />
              )}

              <Section
                variant="transparent"
                padding={4}
                xstyle={styles.toolbarContainer}>
                <VStack gap={4}>
                  {/* No page-title component publishes an end slot — Heading,
                      Section and LayoutHeader all take content only — so the
                      title and its action are a row, the same shape the other
                      table templates use. */}
                  <HStack gap={3} vAlign="center">
                    <StackItem size="fill">
                      <Heading level={1}>Service jobs</Heading>
                    </StackItem>
                    <Button
                      label="New job"
                      variant="primary"
                      onClick={() => alert('New job')}
                    />
                  </HStack>

                  {selectedCount > 0 ? (
                    bulkBar
                  ) : (
                    <HStack gap={3} vAlign="center" wrap="wrap">
                      <StackItem size="fill" xstyle={styles.toolbarPrimary}>
                        {isPowerSearch ? (
                          <PowerSearch
                            config={config}
                            filters={filters}
                            onChange={next => setFilters([...next])}
                            placeholder='Try "quote > 1000" or "status is Overdue"'
                            resultCount={results.length}
                          />
                        ) : isSavedViewsBarOpen ? (
                          savedViewsBar
                        ) : (
                          filterBar
                        )}
                      </StackItem>

                      {/* One flex item rather than loose siblings: at narrow
                          widths the whole cluster has to drop below the filter
                          row together, and loose siblings would break up
                          mid-cluster instead. */}
                      <HStack
                        gap={3}
                        vAlign="center"
                        xstyle={styles.toolbarEnd}>
                        {/* Saved views mode is about picking a view, so the
                          controls that edit one step aside. Only the toggle
                          that got you here stays, which is also the way back. */}
                        {!isSavedViewsBarOpen && (
                          <>
                            {/* Only while power search is up: the query bar has
                              no filter row to carry the toggle, so this is the
                              return trip. In token mode it sits by the result
                              count instead, next to the controls it swaps.

                              Leads the cluster so it stays the leftmost control
                              in both modes, rather than crossing to the far side
                              of View options when the bar switches. */}
                            {isPowerSearch && powerSearchToggle}

                            {/* Same trigger either way; only what it opens
                              changes. On a phone the panel is the sheet
                              rendered beside the dialogs below, so the button
                              drives `isViewOpen` directly instead of being a
                              Popover's child. */}
                            {isCompactSurface ? (
                              viewOptionsTrigger
                            ) : (
                              <Popover
                                placement="below"
                                alignment="end"
                                width={660}
                                label="View options"
                                isOpen={isViewOpen}
                                onOpenChange={setIsViewOpen}
                                xstyle={styles.viewPopoverSurface}
                                content={viewOptionsPopover}>
                                {viewOptionsTrigger}
                              </Popover>
                            )}

                            {/* `tooltip` is stated rather than left to
                              isIconOnly: the automatic tooltip the prop
                              documents does not reach Button, so an icon-only
                              button shows nothing on hover without it. Same for
                              the Saved views toggle below. */}
                            <IconButton
                              label="Create saved view"
                              tooltip="Create saved view"
                              variant="ghost"
                              size="sm"
                              icon={<Icon icon={BookmarkPlus} size="sm" />}
                              onClick={() => setCreatingName('')}
                            />
                          </>
                        )}

                        <ToggleButton
                          label="Saved views"
                          tooltip="Saved views"
                          isIconOnly
                          size="sm"
                          isPressed={isSavedViewsBarOpen}
                          icon={<Icon icon={Bookmark} size="sm" />}
                          pressedIcon={<Icon icon={BookmarkFilled} size="sm" />}
                          onPressedChange={next => {
                            setIsSavedViewsBarOpen(next);
                            // Power search wins the render below, so opening the
                            // bar from that mode would toggle a control that
                            // changes nothing on screen. Asking for saved views
                            // is a decision to leave the query bar.
                            if (next) {
                              setIsPowerSearch(false);
                            }
                          }}
                        />
                      </HStack>
                    </HStack>
                  )}
                </VStack>
              </Section>
            </VStack>
          </LayoutHeader>
        }
        content={
          /* Default padding (16px) is deliberate: Table bleeds to the edges
             and re-applies it to the first and last cells. */
          <LayoutContent padding={4} label="Service jobs">
            {results.length === 0 ? (
              <EmptyState
                icon={<Icon icon={Search} size="lg" />}
                title="No jobs match these filters"
                description="Try clearing a filter, or switch to power search to build a broader query."
                actions={
                  <>
                    <Button label="Clear all" onClick={clearAll} />
                    <Button
                      label="Power search"
                      variant="secondary"
                      onClick={() => setIsPowerSearch(true)}
                    />
                  </>
                }
              />
            ) : (
              <Table<ServiceJob>
                // Grouping flattens the batch into headers and rows; off, the
                // batch goes in untouched.
                data={isGrouped ? groupedRows : rows}
                columns={columns}
                idKey={isGrouped ? groupRowKey : 'id'}
                density={view.density}
                dividers="rows"
                hasHover
                textOverflow="wrap"
                // Rows are two lines in the Job column at every density but
                // compact; top alignment keeps the checkbox and every other
                // cell on the first content line.
                verticalAlign="top"
                plugins={plugins}
                rowCount={results.length}
              />
            )}

            {results.length > 0 &&
              (hasNext ? (
                // Tall enough that the observer trips before the reader
                // reaches the true end of the list.
                <VStack ref={sentinelRef} gap={0} minHeight={56}>
                  {isLoadingNext && (
                    <LoadingRows columns={columns} density={view.density} />
                  )}
                </VStack>
              ) : (
                results.length > PAGE_SIZE && (
                  <VStack
                    gap={0}
                    minHeight={56}
                    vAlign="center"
                    hAlign="center">
                    <Text type="supporting" color="secondary">
                      All {results.length} jobs loaded
                    </Text>
                  </VStack>
                )
              ))}
          </LayoutContent>
        }
      />

      {/* Mounted at every width rather than behind the branch: a closed
          BottomSheet is one hidden dialog element, and gating the mount would
          tear the panel down under a reader who rotates the phone mid-edit.
          The branch lives in its `isOpen` instead. */}
      {viewOptionsSheet}
      {detailSheet}

      {/* Create saved view.

          On the Dialog branch: DialogHeader + Section are two regions, 16px on
          each. The Dialog keeps its --spacing-4 default rather than restating
          padding={4}; either way it puts that gutter on its inner wrapper and
          republishes it, and the header would otherwise pad on top of it. The
          Section escapes the wrapper on its own; dialogHeaderBleed does the
          same for the header so both land on one 16px gutter. */}
      <AdaptiveSavedViewForm
        isOpen={creatingName != null}
        onOpenChange={open => setCreatingName(open ? '' : null)}
        title="Create new saved view"
        subtitle="Captures the filters and the table configuration as they are now."
        isCompactSurface={isCompactSurface}>
        <TextInput
          label="Name"
          value={creatingName ?? ''}
          onChange={setCreatingName}
          hasAutoFocus
        />
        <VStack gap={1}>
          <Text type="label">This view saves</Text>
          <ViewSummaryList view={view} filters={filters} />
        </VStack>
        <HStack hAlign="end">
          <Button
            label="Create"
            variant="primary"
            isDisabled={(creatingName ?? '').trim() === ''}
            onClick={() => createSavedView(creatingName ?? '')}
          />
        </HStack>
      </AdaptiveSavedViewForm>

      {/* Edit saved view */}
      <AdaptiveSavedViewForm
        isOpen={editing != null}
        onOpenChange={open => !open && setEditing(null)}
        title="Edit saved view"
        subtitle="Renaming only. The configuration is what was captured when the view was saved."
        isCompactSurface={isCompactSurface}>
        <TextInput
          label="Name"
          value={editing?.name ?? ''}
          onChange={value =>
            setEditing(current =>
              current ? {...current, name: value} : current,
            )
          }
        />
        {/* The configuration is captured, not editable here: it is changed
            by reconfiguring the table and saving a new view. */}
        <VStack gap={1}>
          <Text type="label">This view saves</Text>
          {editing == null ? (
            <Text type="supporting" color="secondary">
              (Empty)
            </Text>
          ) : (
            <ViewSummaryList view={editing.view} filters={editing.filters} />
          )}
        </VStack>
        <HStack gap={2} vAlign="center">
          <Button
            label="Delete"
            variant="destructive"
            onClick={() => editing && deleteSavedView(editing.id)}
          />
          <StackItem size="fill">
            <HStack hAlign="end">
              <Button
                label="Save"
                variant="primary"
                onClick={() => editing && saveEditedView(editing)}
              />
            </HStack>
          </StackItem>
        </HStack>
      </AdaptiveSavedViewForm>
    </>
  );
}
