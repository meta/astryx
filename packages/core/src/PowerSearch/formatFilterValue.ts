// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file formatFilterValue.ts
 * @input OperatorValue, FilterValue, config, locale, time zone, calendar
 * @output Formatted display string for a filter value
 * @position Pure utility; consumed by PowerSearch token rendering
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 */

import type {OperatorValue, FilterValue, EnumItem} from './types';
import type {InternalConfig} from './useInternalConfig';
import type {Locale, TranslatorFn} from '../i18n';
import {
  formatCalendarInstant,
  type CalendarSystem,
} from '../utils/calendarSystem';
import {truncateCharacters} from '../utils/characters';
import {registerEnglishFallback} from '../i18n/englishFallback';
import english from '../i18n/generated-english/PowerSearch/formatFilterValue.generated';
import {resolveDateZone} from './powerSearchDateZone';

registerEnglishFallback(english);

function truncate(str: string, maxLength: number): string {
  return truncateCharacters(str, maxLength);
}

function formatEnumLabel(
  value: string,
  enumValues: ReadonlyArray<EnumItem>,
): string {
  const item = enumValues.find(v => v.value === value);
  return item?.label ?? value;
}

function formatNumber(value: number, locale: Locale, units?: string): string {
  const formatted = formatSharedNumber(value, locale);
  return units ? `${formatted} ${units}` : formatted;
}

/**
 * A number in the provider locale's digits, decimal mark, and — unless the
 * options say otherwise — grouping. The shared number helper for
 * PowerSearch's own readings of a value — this module owns the raw `Intl`
 * access.
 */
export function formatSharedNumber(
  value: number,
  locale: Locale,
  options?: Pick<
    Intl.NumberFormatOptions,
    'useGrouping' | 'maximumFractionDigits'
  >,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * The one reading of a calendar-day `date_absolute` value: its day in the
 * zone `resolveDateZone` names. The token text and the accessible label share
 * it; the editors read the same zone through `resolveDateZone`, so a value
 * never reads as two days in one field. A value whose operator sets
 * `isDateOnly: false` is an instant: its date and time in `timezoneID`,
 * else the viewer's zone, the time its editor reads and writes.
 */
export function formatDateAbsolute(
  unixSeconds: number,
  locale: Locale,
  timezoneID: string | undefined,
  isDateOnly = true,
  calendar: CalendarSystem = 'gregory',
): string {
  const options: Intl.DateTimeFormatOptions = isDateOnly
    ? {year: 'numeric', month: 'short', day: 'numeric'}
    : {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      };
  return formatCalendarInstant(
    calendar,
    new Date(unixSeconds * 1000),
    options,
    locale,
    resolveDateZone(timezoneID, isDateOnly),
  );
}

function formatRelativeDate(value: string): string {
  // value is stored as a descriptive string like "7d" or "1w"
  return value;
}

function formatDateRange(
  _value: {start: unknown; end: unknown},
  t: TranslatorFn,
): string {
  return t('@astryx.powersearch.valueEditor.dateRange');
}

/**
 * The display text of a filter value. A `date_absolute` value is written in
 * `calendar`, which defaults to Gregorian; PowerSearch passes the calendar that
 * its provider resolves.
 */
export function formatFilterValue(
  _config: InternalConfig,
  operatorValue: OperatorValue,
  filterValue: FilterValue,
  maxLength: number,
  t: TranslatorFn,
  locale: Locale,
  timezoneID?: string,
  calendar: CalendarSystem = 'gregory',
): string {
  switch (filterValue.type) {
    case 'empty':
      return '';

    case 'string':
      return truncate(filterValue.value, maxLength);

    case 'integer':
      return formatNumber(
        filterValue.value,
        locale,
        operatorValue.type === 'integer' ? operatorValue.units : undefined,
      );

    case 'float':
      return formatNumber(
        filterValue.value,
        locale,
        operatorValue.type === 'float' ? operatorValue.units : undefined,
      );

    case 'enum':
      if (operatorValue.type === 'enum') {
        return truncate(
          formatEnumLabel(filterValue.value, operatorValue.values),
          maxLength,
        );
      }
      return truncate(filterValue.value, maxLength);

    case 'string_list': {
      const items = filterValue.value;
      if (items.length === 0) {
        return '';
      }
      if (items.length === 1) {
        return truncate(items[0], maxLength);
      }
      const joined = items.join(', ');
      if (joined.length <= maxLength) {
        return joined;
      }
      return t('@astryx.powersearch.valueEditor.itemsCount', {
        count: items.length,
      });
    }

    case 'enum_list': {
      const items = filterValue.value;
      if (items.length === 0) {
        return '';
      }
      if (operatorValue.type === 'enum_list') {
        const labels = items.map(v => formatEnumLabel(v, operatorValue.values));
        if (labels.length === 1) {
          return truncate(labels[0], maxLength);
        }
        const joined = labels.join(', ');
        if (joined.length <= maxLength) {
          return joined;
        }
        return t('@astryx.powersearch.valueEditor.itemsCount', {
          count: labels.length,
        });
      }
      if (items.length === 1) {
        return truncate(items[0], maxLength);
      }
      return t('@astryx.powersearch.valueEditor.itemsCount', {
        count: items.length,
      });
    }

    case 'entity_list': {
      const entities = filterValue.value;
      if (entities.length === 0) {
        return '';
      }
      if (entities.length === 1) {
        return truncate(entities[0].label, maxLength);
      }
      const joined = entities.map(e => e.label).join(', ');
      if (joined.length <= maxLength) {
        return joined;
      }
      return t('@astryx.powersearch.valueEditor.entitiesCount', {
        count: entities.length,
      });
    }

    case 'time':
      return filterValue.value;

    case 'date_absolute':
      return truncate(
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
      return formatRelativeDate(filterValue.value);

    case 'date_range':
      return formatDateRange(filterValue.value, t);

    case 'custom':
      if (operatorValue.type === 'custom') {
        return truncate(operatorValue.getString(filterValue.value), maxLength);
      }
      return filterValue.value;

    case 'nested': {
      const count = filterValue.value.length;
      return t('@astryx.powersearch.valueEditor.filtersCount', {count});
    }

    default:
      return '';
  }
}
