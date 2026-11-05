// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipEntries.ts
 * @input A Date, the consumer's tooltip entry list, a locale and a calendar
 * @output Pure formatting of one tooltip line per entry, plus the entry types
 * @position Leaf module; owns which zone each tooltip line names and whether
 *   it needs a zone abbreviation, then defers to formatInstant to render it
 *
 * This module holds only the decisions a tooltip makes that the visible text
 * does not: resolving `timezoneID` (including the `'local'` alias and the
 * fallback for an unknown identifier), and deciding which lines need a zone
 * abbreviation to be told apart. The formatting itself is formatInstant's,
 * shared with the rendered text, so the two surfaces cannot drift.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Timestamp/Timestamp.tsx
 * - /packages/core/src/Timestamp/formatInstant.ts
 * - /packages/core/src/Timestamp/tooltipEntries.test.ts
 * - /packages/core/src/Timestamp/Timestamp.doc.mjs
 * - /packages/core/src/Timestamp/index.ts
 */

import {devWarn} from '../utils/devWarning';
import {formatInstant} from './formatInstant';
import type {InstantFormat} from './formatInstant';
import type {Locale} from '../i18n/types';
import type {CalendarSystem} from '../utils/calendarSystem';

// =============================================================================
// Types
// =============================================================================

/**
 * Formats available to a tooltip line.
 *
 * Every `TimestampFormat` that names a fixed instant, plus `'full'` — the long
 * absolute style the tooltip has always shown ("February 19, 2026 at 5:00:00 PM
 * UTC"). `'relative'`, `'relative_short'`, and `'auto'` are excluded: a
 * relative phrase ignores any zone, which would make `timezoneID` silently
 * inert on that line.
 *
 * `'full'` lives only in this vocabulary, never in `TimestampFormat` — nothing
 * asked for it as a visible display format, and keeping it out means new
 * members added to `TimestampFormat` become valid tooltip formats for free.
 *
 * The public spelling of {@link InstantFormat}: consumers reading Timestamp's
 * props should not have to know the name of its internal formatter.
 */
export type TimestampTooltipFormat = InstantFormat;

/** One line of the Timestamp tooltip. */
export interface TimestampTooltipEntry {
  /**
   * IANA time zone identifier, e.g. `'UTC'`, `'America/Los_Angeles'`.
   * Omit it — or pass `'local'` — for the viewer's own zone.
   *
   * Prefer region identifiers. Fixed-offset abbreviations such as `'EST'` are
   * accepted by the platform but never observe daylight saving, so they read
   * an hour wrong for half the year — `'America/New_York'` is what people
   * usually mean by "Eastern".
   *
   * An identifier the platform does not recognize falls back to the viewer's
   * zone with a console warning rather than throwing.
   */
  timezoneID?: string;
  /**
   * How this line renders the instant.
   * @default 'full'
   */
  format?: TimestampTooltipFormat;
  /**
   * Text shown beside the time, e.g. `'Local'`, `'UTC'`, `'Pacific'`.
   * Supplied already translated; Timestamp never invents or localizes labels.
   */
  label?: string;
  /**
   * Whether this row shows a copy-to-clipboard button, rendered in a dedicated
   * trailing action column so the buttons line up across rows regardless of
   * each value's width. The action column is only reserved when at least one
   * row is copyable, so a fully read-only card has no trailing gutter.
   *
   * Defaults to `false` — rows are read-only unless opted in. Set `true` for a
   * row whose value is worth pasting elsewhere, such as a machine-readable
   * `system_date_time` value shown beside human-readable zones that only need
   * to be read.
   * @default false
   */
  isCopyable?: boolean;
}

/** A rendered tooltip line. */
export interface TimestampTooltipLine {
  label?: string;
  value: string;
  isCopyable: boolean;
}

// =============================================================================
// Zone resolution
// =============================================================================

/** Spelling that means "the viewer's own zone" without naming it. */
const LOCAL_ZONE_ALIAS = 'local';

/**
 * Zone identifiers already reported as unknown.
 *
 * Resolution runs once per entry on every render, so without this a single
 * typo on a live timestamp would emit the same warning every tick, forever.
 * One report per bad identifier is enough to act on.
 */
const warnedTimezoneIDs = new Set<string>();

/**
 * Resolves an entry's zone to something safe to hand to `Intl`.
 *
 * Returns `undefined` for the viewer's own zone, which is also what `Intl`
 * treats as "use the host zone" — so the local path never constructs a
 * formatter with an explicit `timeZone` and cannot drift from today's output.
 */
function resolveTimezoneID(timezoneID: string | undefined): string | undefined {
  if (
    timezoneID === undefined ||
    timezoneID.toLowerCase() === LOCAL_ZONE_ALIAS
  ) {
    return undefined;
  }

  // An unrecognized identifier makes every Intl.DateTimeFormat constructor
  // throw a RangeError. Rendering a timestamp must never take down the tree —
  // degrade to the viewer's zone and say so, mirroring how an unparseable
  // `value` is handled in Timestamp.tsx.
  try {
    // Locale does not affect time-zone identifier validity; pin one so this
    // validation path stays explicit and deterministic.
    new Intl.DateTimeFormat('en-US', {timeZone: timezoneID});
  } catch {
    if (!warnedTimezoneIDs.has(timezoneID)) {
      warnedTimezoneIDs.add(timezoneID);
      devWarn(
        'Timestamp',
        `unknown time zone ${JSON.stringify(timezoneID)} in tooltipEntries. Falling back to the viewer's time zone.`,
      );
    }
    return undefined;
  }

  return timezoneID;
}

/**
 * A stable key for "which zone did the consumer ask for", used to decide
 * whether the tooltip needs zone abbreviations to disambiguate its lines.
 *
 * Deliberately keyed on the *requested* zone, not on the resolved offset: a
 * consumer who asks for two zones gets both labelled even when the viewer
 * happens to be sitting in one of them, so the rendering does not change shape
 * depending on where the reader is. That also keeps this testable under any
 * machine timezone.
 */
function zoneKey(resolved: string | undefined): string {
  return resolved === undefined ? LOCAL_ZONE_ALIAS : resolved.toLowerCase();
}

// =============================================================================
// Zone marking
// =============================================================================

/**
 * Whether a format should carry a zone abbreviation.
 *
 * `'full'` always has one (that is the style). `system_*` never does — those
 * are machine shapes and a trailing "PST" would break anything parsing them,
 * which is also why `isTimezoneShown` has never applied to them.
 *
 * The two human formats that can carry one do so when either the reader has
 * to tell several lines apart, or the line shows a zone the consumer named
 * explicitly. That second case matters even for a lone entry: the tooltip is
 * the `<time>` element's `aria-describedby`, and that element's accessible
 * name is the absolute time in the *viewer's* zone — so an unmarked foreign
 * time is announced directly after a local one with nothing to distinguish
 * them. A line the consumer did not steer stays unmarked, matching how the
 * visible text reads with `isTimezoneShown` off.
 */
function shouldShowZoneName(
  format: TimestampTooltipFormat,
  hasMultipleZones: boolean,
  isNamedZone: boolean,
): boolean {
  if (format === 'full') {
    return true;
  }
  if (format === 'date_time' || format === 'time') {
    return hasMultipleZones || isNamedZone;
  }
  return false;
}

/**
 * Renders one tooltip line per entry, in the order given, with dates in
 * `calendar`.
 *
 * Pure: the same `date` and `entries` always produce the same lines for a given
 * host zone, locale, and calendar.
 */
export function formatTooltipLines(
  date: Date,
  entries: ReadonlyArray<TimestampTooltipEntry>,
  locale: Locale,
  calendar: CalendarSystem = 'gregory',
): ReadonlyArray<TimestampTooltipLine> {
  const resolved = entries.map(entry => resolveTimezoneID(entry.timezoneID));
  const hasMultipleZones = new Set(resolved.map(zoneKey)).size > 1;

  return entries.map((entry, index) => {
    const format = entry.format ?? 'full';
    const timeZone = resolved[index];

    return {
      ...(entry.label === undefined ? {} : {label: entry.label}),
      isCopyable: entry.isCopyable ?? false,
      value: formatInstant(date, format, locale, {
        timeZone,
        calendar,
        isTimezoneShown: shouldShowZoneName(
          format,
          hasMultipleZones,
          timeZone !== undefined,
        ),
      }),
    };
  });
}
