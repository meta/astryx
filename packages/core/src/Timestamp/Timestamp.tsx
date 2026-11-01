// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Timestamp.tsx
 * @input Uses React, Text, provider locale, and Timestamp formatters
 * @output Exports Timestamp component and related types
 * @position Core implementation; renders formatted timestamps
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Timestamp/formatRelativeTime.ts
 * - /packages/core/src/Timestamp/Timestamp.doc.mjs
 * - /packages/core/src/Timestamp/Timestamp.test.tsx
 * - /packages/core/src/Timestamp/index.ts
 * - /apps/storybook/stories/Timestamp.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Timestamp/ (showcase blocks)
 */

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Text} from '../Text';
import type {TextType, TextSize, TextColor, TextWeight} from '../theme/types';
import {mergeProps} from '../utils';
import {useDevWarning} from '../hooks/useDevWarning';
import {useTranslator} from '../i18n';
import {useLocale} from '../i18n/useLocale';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {formatInstant} from './formatInstant';
import {formatRelativeTime} from './formatRelativeTime';
import {formatTooltipLines} from './tooltipEntries';
import type {
  TimestampTooltipEntry,
  TimestampTooltipLine,
} from './tooltipEntries';

import {useMergedRefs} from '../hooks/useMergedRefs';
// Load the overlay lazily so a card-less Timestamp — the default — never
// bundles HoverCard or the copy affordance's Icon/IconButton. Mirrors the code
// split the read-only Tooltip path used before it.
const LazyTimestampHoverCard = lazy(async () => import('./TimestampHoverCard'));

// =============================================================================
// Types
// =============================================================================

export type TimestampFormat =
  | 'relative'
  | 'relative_short'
  | 'auto'
  | 'date'
  | 'date_long'
  | 'date_weekday'
  | 'date_time'
  | 'time'
  | 'system_date'
  | 'system_date_time'
  | 'system_time'
  | 'unix_seconds';

export interface TimestampProps extends BaseProps<HTMLTimeElement> {
  /** Ref forwarded to the root `<time>` element. */
  ref?: React.Ref<HTMLTimeElement>;
  /** The date/time to display. Accepts Unix timestamps (seconds) or ISO 8601 strings. */
  value: string | number;
  /**
   * Display format.
   * - `'relative'`: "2 hours ago", "yesterday", "now"
   * - `'relative_short'`: "2h ago", "1d ago", "now" in English — the
   *   locale's native narrow relative-time pattern, for compact,
   *   space-constrained surfaces
   * - `'auto'`: Relative for recent times, `date_time` for older
   * - `'date'`: "Mar 21, 2025"
   * - `'date_long'`: "March 21, 2025"
   * - `'date_weekday'`: "Wed, Mar 21, 2025"
   * - `'date_time'`: "Mar 21, 2025, 2:51 PM"
   * - `'time'`: "2:51 PM"
   * - `'system_date'`: "2025-03-21"
   * - `'system_date_time'`: "2025-03-21 14:51:53"
   * - `'system_time'`: "14:51:53"
   * - `'unix_seconds'`: "1742565113" — Unix time in whole seconds since the
   *   epoch. Absolute (zone-independent), so it ignores any tooltip time zone.
   * @default 'auto'
   */
  format?: TimestampFormat;
  /**
   * Threshold in seconds for 'auto' format to switch from relative to date_time.
   * @default 604800 (7 days)
   */
  autoThreshold?: number;
  /**
   * Whether to show a hover card with the full date/time on hover. The card
   * is copyable — its default single row carries the full absolute time — and
   * `tooltipEntries` customizes its rows.
   * @default true
   */
  hasTooltip?: boolean;
  /**
   * Lines to show on hover, so one instant can be read — and optionally
   * copied — in several time zones and/or formats at once. Each entry is one
   * line, rendered in the order given, with an optional label.
   *
   * Rows are read-only unless they set `isCopyable` (default `false`). A
   * copyable row shows a copy button in a dedicated trailing action column so
   * the buttons align across rows; that column is only present when some row
   * is copyable. With no entries the card shows a single default row with the
   * full absolute time in the viewer's own zone, which is copyable.
   *
   * Configuring entries also attaches the surface to absolute formats, which
   * otherwise have no hover card at all. `hasTooltip={false}` still suppresses
   * it, and an empty array is treated as no configuration.
   *
   * @default undefined — a single default row with the full absolute time in
   *   the viewer's own time zone
   * @example
   * ```
   * <Timestamp
   *   value={savedAt}
   *   tooltipEntries={[
   *     {label: 'Your time'},
   *     {timezoneID: 'UTC', label: 'UTC'},
   *     {timezoneID: 'UTC', format: 'system_date_time', label: 'ISO', isCopyable: true},
   *   ]}
   * />
   * ```
   */
  tooltipEntries?: ReadonlyArray<TimestampTooltipEntry>;
  /**
   * Whether to append the timezone abbreviation after the timestamp text.
   * Applies to the date_time and time formats. The system_* formats stay
   * machine-readable and never carry a timezone abbreviation.
   *
   * Affects the visible text only — use `tooltipEntries` to control the
   * tooltip's time zones.
   * @default false
   */
  isTimezoneShown?: boolean;
  /**
   * Whether the relative time should update live.
   * @default false
   */
  isLive?: boolean;
  /**
   * Semantic text type. Determines size, weight, and line-height from theme.
   * @default 'supporting'
   */
  type?: TextType;
  /**
   * Explicit font size override. Overrides the size from `type`.
   */
  size?: TextSize;
  /**
   * Text color.
   * @default 'secondary'
   */
  color?: TextColor;
  /**
   * Font weight override.
   */
  weight?: TextWeight;
  /** Test ID for testing frameworks. */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  time: {
    display: 'inline',
    fontFamily: 'inherit',
    fontStyle: 'normal',
    // Reset <time> element defaults
    fontSize: 'inherit',
    lineHeight: 'inherit',
    color: 'inherit',
    fontWeight: 'inherit',
  },
});

// =============================================================================
// Formatting utilities
// =============================================================================

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

/** Default auto threshold: 7 days in seconds */
const DEFAULT_AUTO_THRESHOLD = 7 * DAY;

function parseValue(value: string | number): Date {
  if (typeof value === 'number') {
    // Heuristic: if the number is less than 1e12, treat as seconds; otherwise ms.
    // Unix timestamps in seconds are < 1e12 until ~2286.
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  return new Date(value);
}

/** Returns the interval (in ms) at which a relative timestamp should update. */
function getLiveInterval(diffSeconds: number): number {
  const absDiff = Math.abs(diffSeconds);
  if (absDiff < MINUTE) {
    return 1000;
  } // every second
  if (absDiff < HOUR) {
    return 30_000;
  } // every 30s
  if (absDiff < DAY) {
    return 60_000;
  } // every minute
  return 300_000; // every 5 minutes
}

// Whether this render may read the current time. Server renders (including
// static prerenders) and the hydration pass read `false`, so the markup never
// depends on when it was rendered; client renders read `true`.
const subscribeToNothing = () => () => {};
const canReadClockOnClient = () => true;
const canReadClockOnServer = () => false;

/** Whether a format is non-relative (i.e. shows a fixed date/time). */
function isAbsoluteFormat(
  format: TimestampFormat,
): format is Exclude<TimestampFormat, 'relative' | 'relative_short' | 'auto'> {
  return (
    format !== 'relative' && format !== 'relative_short' && format !== 'auto'
  );
}

/**
 * Whether a format renders a relative phrase ("2 hours ago" / "2h ago") rather
 * than a fixed instant. Both the long and short relative forms share the same
 * treatment: they get the accessible full-date name, the hover tooltip, and
 * live updates.
 */
function isRelativeFormat(
  format: TimestampFormat,
): format is 'relative' | 'relative_short' {
  return format === 'relative' || format === 'relative_short';
}

// =============================================================================
// Component
// =============================================================================

/**
 * Displays a formatted timestamp as human-readable text.
 *
 * Renders a semantic `<time>` element with an ISO 8601 `datetime` attribute,
 * styled via Text. Supports relative ("2 hours ago"), multiple absolute
 * formats, and auto formatting. Optionally shows a hover card with the full
 * absolute time (copyable) and can update live.
 *
 * @example
 * ```
 * <Timestamp value="2026-02-19T17:00:00Z" />
 * <Timestamp value={1740000000} format="date" />
 * <Timestamp value={date} format="auto" isLive />
 * <Timestamp value={event.timestamp} format="system_date_time" />
 * ```
 */
export function Timestamp({
  value,
  format = 'auto',
  autoThreshold = DEFAULT_AUTO_THRESHOLD,
  hasTooltip = true,
  tooltipEntries,
  isTimezoneShown = false,
  isLive = false,
  type = 'supporting',
  size,
  color = 'secondary',
  weight,
  xstyle,
  className,
  style,
  ref,
  'data-testid': testId,
  ...rest
}: TimestampProps) {
  const t = useTranslator();
  const locale = useLocale();
  const timeRef = useRef<HTMLTimeElement>(null);
  const mergedTimeRef = useMergedRefs(ref, timeRef);
  // Only relative and auto formats depend on the current time. Absolute
  // formats never read the clock, so they render identically on the server,
  // in a static prerender, and on the client. A clock-dependent format reads
  // it on the client only: server renders and the hydration pass show the
  // full date and time in UTC, and the client switches to the relative phrase
  // right after hydration.
  const needsClock = !isAbsoluteFormat(format);
  const canReadClock = useSyncExternalStore(
    subscribeToNothing,
    canReadClockOnClient,
    canReadClockOnServer,
  );
  const [now, setNow] = useState<Date | null>(() =>
    needsClock && canReadClock ? new Date() : null,
  );
  // Read the clock during render once it may be read: after hydration (the
  // store re-renders with its client value) and when `format` switches from
  // an absolute value to a clock-dependent one, so the placeholder never
  // commits on the client.
  if (needsClock && canReadClock && now === null) {
    // eslint-disable-next-line @eslint-react/purity -- seeds clock state once, like the initializer; never runs on the server or while hydrating
    setNow(new Date());
  }

  const date = parseValue(value);
  // An unparseable value (a malformed date string, or a NaN timestamp from
  // missing data) yields an Invalid Date, and formatting one throws "Invalid
  // time value" — crashing the whole tree. Compute nothing from it here and
  // bail out below (after the hooks) instead.
  const isValidDate = !Number.isNaN(date.getTime());
  const isoString = isValidDate ? date.toISOString() : '';

  // Determine effective format. Until the clock is read, a clock-dependent
  // format renders as the full date and time.
  const isClockPending = needsClock && now === null;
  const diffSeconds =
    now === null ? 0 : Math.round((now.getTime() - date.getTime()) / 1000);
  const effectiveFormat: TimestampFormat = isClockPending
    ? 'date_time'
    : format === 'auto'
      ? Math.abs(diffSeconds) <= autoThreshold
        ? 'relative'
        : 'date_time'
      : format;

  // Format the display text in the viewer's own zone; only the tooltip names
  // others. The one exception is the pre-hydration placeholder, written in
  // UTC with its label so every zone produces the same markup.
  const displayText = !isValidDate
    ? ''
    : effectiveFormat === 'relative'
      ? formatRelativeTime(date, now ?? date, locale, 'long')
      : effectiveFormat === 'relative_short'
        ? formatRelativeTime(date, now ?? date, locale, 'narrow')
        : isAbsoluteFormat(effectiveFormat)
          ? formatInstant(
              date,
              effectiveFormat,
              locale,
              // The pre-hydration placeholder is written in UTC, labelled, so
              // the server and the hydrating client produce the same text in
              // every time zone.
              isClockPending
                ? {timeZone: 'UTC', isTimezoneShown: true}
                : {isTimezoneShown},
            )
          : '';

  // Full absolute text for the tooltip (visible — keeps the compact timezone
  // abbreviation) and for the AT-facing aria-label, which spells the timezone
  // out in full: abbreviations like "PST" or "GMT+2" are unexpanded
  // abbreviations to a screen-reader user (WCAG 3.1.4).
  const fullAbsoluteText = isValidDate
    ? formatInstant(date, 'full', locale)
    : '';
  const ariaLabelText = isValidDate
    ? formatInstant(date, 'full', locale, {timeZoneNameStyle: 'long'})
    : '';

  // Live updates
  useEffect(() => {
    if (!isLive || !isValidDate || !isRelativeFormat(effectiveFormat)) {
      return;
    }

    const interval = getLiveInterval(diffSeconds);
    const timer = setInterval(() => {
      setNow(new Date());
    }, interval);

    return () => clearInterval(timer);
  }, [isLive, isValidDate, effectiveFormat, diffSeconds]);

  useDevWarning(
    'Timestamp',
    `could not parse value ${JSON.stringify(value)} as a date. Rendering nothing.`,
    !isValidDate,
  );

  // Placed after all hooks so the hook order stays stable across renders.
  if (!isValidDate) {
    return null;
  }

  // An empty array is not a second way to spell "off" — `hasTooltip` stays the
  // only on/off axis — so normalize it away before anything reads it.
  const entries =
    tooltipEntries !== undefined && tooltipEntries.length > 0
      ? tooltipEntries
      : undefined;

  // Absolute formats have never carried a hover surface. Leaving that gate
  // closed when a consumer has explicitly configured tooltip lines would let
  // `format` silently suppress another prop's output, so entry presence opens
  // it too. With no entries this reduces to the original condition exactly.
  const showTooltip =
    hasTooltip && (isRelativeFormat(effectiveFormat) || entries !== undefined);

  // The rows the hover card renders: the configured entries, or the single
  // default absolute line shown when none are set. Either way the surface is
  // the same copyable card — the default line is a one-row card carrying the
  // full absolute time, itself copyable, just like a configured entry.
  const lines: ReadonlyArray<TimestampTooltipLine> =
    entries === undefined
      ? [{value: fullAbsoluteText, isCopyable: true}]
      : formatTooltipLines(date, entries, locale);

  const timestampProps = mergeProps(
    themeProps('timestamp', {format: effectiveFormat}),
    {className, style},
  );

  const timeElement = (
    <Text
      type={type}
      size={size}
      color={color}
      weight={weight}
      xstyle={xstyle}
      {...timestampProps}>
      <time
        ref={mergedTimeRef}
        dateTime={isoString}
        data-testid={testId}
        {...stylex.props(styles.time)}
        {...rest}
        // `ariaLabelText` is '' only for an invalid date, which bails out
        // before rendering — but keep the guard local: an empty aria-label
        // must be omitted entirely (not rendered as aria-label="") so AT
        // falls back to reading the visible <time> content.
        // A caller's own name wins (`component:Timestamp` FR5).
        {...(isRelativeFormat(effectiveFormat) &&
        ariaLabelText !== '' &&
        rest['aria-label'] == null
          ? {'aria-label': ariaLabelText}
          : {})}
        // The hover card is anchored here with focusTrigger="always", which
        // attaches focus listeners but does not itself make the anchor
        // focusable. A bare <time> is not focusable, so without a tab stop
        // sighted keyboard users could never reveal the card (WCAG 1.4.13 /
        // 2.1.1). Add the tab stop only while a card is actually attached — no
        // gratuitous tab stops otherwise. The card carries its own
        // dashed-underline hover indication as the affordance, so the anchor
        // needs no separate focus outline.
        // A caller's own tabIndex wins (`component:Timestamp` FR9).
        {...(showTooltip && rest.tabIndex == null ? {tabIndex: 0} : {})}>
        {displayText}
      </time>
    </Text>
  );

  if (showTooltip) {
    // One surface for every timestamp that shows one: the copyable hover card,
    // loaded lazily so the default card-less path never bundles it. Each line
    // becomes a labelled row with its own copy button. With no configured
    // entries this is a single row carrying the full absolute time, itself
    // copyable — so hovering a relative timestamp reveals the full time and
    // lets the reader copy it. Opens on hover and on keyboard focus (the
    // <time> tab stop above), with the dashed-underline affordance signalling
    // it is interactive.
    //
    // While the chunk loads the bare <time> stays visible (the Suspense
    // fallback), so nothing disappears — the card simply attaches once ready.
    return (
      <Suspense fallback={timeElement}>
        <LazyTimestampHoverCard
          lines={lines}
          label={t('@astryx.timestamp.detailsLabel')}>
          {timeElement}
        </LazyTimestampHoverCard>
      </Suspense>
    );
  }

  return timeElement;
}

Timestamp.displayName = 'Timestamp';
