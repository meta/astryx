// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @fileoverview The text a PowerSearch filter token shows for a value.
 *
 * @input `OperatorValue`, `FilterValue`, a width budget, the locale, the
 * calendar, and the provider's translator.
 * @output `formatTokenValueText` — one string, or null for an empty value;
 * `formatTokenLabel` and `formatTokenText` — the token's "field: operator"
 * label and its full text, each one catalog message; `tokenTextKeepsParts` —
 * whether the full text is the label, a space, then the value.
 * @position Shared by the token itself (`PowerSearch.tsx`) and the sheet
 * presentation's Filters rows and removal announcement
 * (`PowerSearchBottomSheet.tsx`), so every reading of a value on the field
 * uses the same words and the same zone handling.
 */

import type {OperatorValue, FilterValue, EnumItem} from './types';
import type {Locale, TranslatorFn} from '../i18n';
import type {CalendarSystem} from '../utils/calendarSystem';
import {truncateCharacters} from '../utils/characters';
import {
  formatDateAbsolute,
  formatDateRange,
  formatSharedNumber,
} from './formatFilterValue';
import {createListFormatter} from '../i18n/listFormat';
import {relativeDateLabel} from './relativeDateOptions';
import {registerEnglishFallback} from '../i18n/englishFallback';
import english from '../i18n/generated-english/PowerSearch/formatTokenValue.generated';

registerEnglishFallback(english);

/**
 * A filter token's label: its field and operator, joined by one catalog
 * message so a locale can reorder them. A filter with no operator text shows
 * its field alone.
 */
export function formatTokenLabel(
  t: TranslatorFn,
  fieldLabel: string,
  operatorLabel: string,
): string {
  if (operatorLabel === '') {
    return fieldLabel;
  }
  return t('@astryx.powersearch.token.fieldOperator', {
    field: fieldLabel,
    operator: operatorLabel,
  });
}

/** A filter token's full text: its label and its value, in one message. */
export function formatTokenText(
  t: TranslatorFn,
  label: string,
  value: string,
): string {
  return t('@astryx.powersearch.token.labelValue', {label, value});
}

// Characters no message text uses, to find where the catalog puts each part.
const LABEL_MARK = '\uE000';
const VALUE_MARK = '\uE001';

/**
 * Whether the locale writes a token's full text as its label, a space, then
 * its value. Only then can the pill show the label and the styled value as
 * two parts and still read as the full text that names it.
 */
export function tokenTextKeepsParts(t: TranslatorFn): boolean {
  const pattern = formatTokenText(t, LABEL_MARK, VALUE_MARK);
  return new RegExp(`^${LABEL_MARK}\\s+${VALUE_MARK}$`).test(pattern);
}

function truncateString(value: string, limit: number): string {
  // Same semantics as before — strings within limit + 3 pass through, longer
  // ones cut to limit + '...' — but counted in characters, not code units.
  return truncateCharacters(value, limit + 3, '...');
}

function getEnumLabel(values: ReadonlyArray<EnumItem>, value: string): string {
  return values.find(v => v.value === value)?.label ?? value;
}

// Intl's maximum fraction cap: no number the row formats is rounded.
const MAX_FRACTION_DIGITS = 100;

// Whether a locale writes a number with the token's own numerals: Latin
// digits and a `.` decimal mark, so `String(value)` is already the locale's
// reading. Probed once per locale through the shared number helper.
const tokenNumeralLocales = new Map<string, boolean>();
function usesTokenNumerals(locale: Locale): boolean {
  let uses = tokenNumeralLocales.get(locale);
  if (uses == null) {
    uses =
      formatSharedNumber(1234567.5, locale, {
        useGrouping: false,
        maximumFractionDigits: MAX_FRACTION_DIGITS,
      }) === '1234567.5';
    tokenNumeralLocales.set(locale, uses);
  }
  return uses;
}

// A number as the token reads it. Where the locale writes Latin digits and a
// `.` decimal mark, use the token's own text, `String(value)`. Elsewhere, use
// the locale's digits and decimal mark, with no grouping and no rounding: the
// fraction cap is Intl's maximum, so `1e-21` keeps its digits.
function formatNumberAsToken(value: number, locale: Locale): string {
  return usesTokenNumerals(locale)
    ? String(value)
    : formatSharedNumber(value, locale, {
        useGrouping: false,
        maximumFractionDigits: MAX_FRACTION_DIGITS,
      });
}

function itemsSummary(count: number, t: TranslatorFn): string {
  return t('@astryx.powersearch.valueEditor.itemsCount', {count});
}

function formatListText(
  labels: ReadonlyArray<string>,
  maxLength: number,
  t: TranslatorFn,
  locale: Locale,
): string | null {
  if (labels.length === 0) {
    return null;
  }
  if (labels.length === 1) {
    return truncateString(labels[0], maxLength);
  }
  const totalLength = labels.reduce((sum, s) => sum + s.length, 0);
  if (totalLength > maxLength) {
    return itemsSummary(labels.length, t);
  }
  return createListFormatter(locale)(labels);
}

/**
 * The text a filter token shows for a value: the one place that decides how
 * a value reads on the field, so every other reading of the same value —
 * the sheet presentation's Filters rows and its removal announcement — can
 * use the same words and the same zone handling. `maxLength` is the token's
 * width budget; pass `Number.MAX_SAFE_INTEGER` for the untruncated text.
 * A `date_absolute` value is written in `calendar`, the calendar that the
 * provider resolves, and a `date_range` as its two days in the same zone.
 * Pass `canReadClock` false on the server and in the hydrating render.
 * The list and nested summaries and a relative date resolve through the
 * catalog; several labels join as a list in the locale.
 */
export function formatTokenValueText(
  operatorValue: OperatorValue,
  filterValue: FilterValue,
  maxLength: number,
  locale: Locale,
  calendar: CalendarSystem,
  t: TranslatorFn,
  timezoneID?: string,
  canReadClock = true,
): string | null {
  switch (filterValue.type) {
    case 'empty':
      return null;

    case 'string':
      return truncateString(filterValue.value, maxLength);

    case 'integer':
    case 'float':
      return formatNumberAsToken(filterValue.value, locale);

    case 'enum':
      if (operatorValue.type === 'enum') {
        return truncateString(
          getEnumLabel(operatorValue.values, filterValue.value),
          maxLength,
        );
      }
      return truncateString(filterValue.value, maxLength);

    case 'string_list':
      return formatListText(filterValue.value, maxLength, t, locale);

    case 'enum_list': {
      const items = filterValue.value;
      if (items.length === 0) {
        return null;
      }
      if (operatorValue.type === 'enum_list') {
        return formatListText(
          items.map(v => getEnumLabel(operatorValue.values, v)),
          maxLength,
          t,
          locale,
        );
      }
      if (items.length === 1) {
        return truncateString(items[0], maxLength);
      }
      return itemsSummary(items.length, t);
    }

    case 'entity_list':
      return formatListText(
        filterValue.value.map(e => e.label),
        maxLength,
        t,
        locale,
      );

    case 'time':
      return filterValue.value;

    case 'date_absolute':
      // The token reads a value in the zone its editor uses.
      return truncateString(
        formatDateAbsolute(
          filterValue.unixSeconds,
          locale,
          timezoneID,
          operatorValue.type !== 'date_absolute' ||
            operatorValue.isDateOnly !== false,
          calendar,
        ),
        maxLength,
      );

    case 'date_relative':
      return truncateString(
        operatorValue.type === 'date_relative'
          ? relativeDateLabel(operatorValue, filterValue.value, t)
          : filterValue.value,
        maxLength,
      );

    case 'date_range': {
      const days = formatDateRange(
        filterValue.value,
        locale,
        timezoneID,
        calendar,
        canReadClock,
      );
      return days == null
        ? t('@astryx.powersearch.valueEditor.dateRange')
        : truncateString(days, maxLength);
    }

    case 'custom':
      if (operatorValue.type === 'custom') {
        return truncateString(
          operatorValue.getString(filterValue.value),
          maxLength,
        );
      }
      return filterValue.value;

    case 'nested': {
      const count = filterValue.value.length;
      return t('@astryx.powersearch.valueEditor.filtersCount', {count});
    }

    default:
      return null;
  }
}
