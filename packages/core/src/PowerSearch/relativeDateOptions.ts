// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file relativeDateOptions.ts
 * @input An operator's `date_relative` value and a translator
 * @output buildRelativeDateOptions, the relative-date choices an operator
 *   offers; relativeDateLabel, the choice label for a stored value
 * @position The value editors, the sheet's rows and both token formatters
 *   use it. A stored value (`3d_ago`) then reads as one catalog message
 *   ("3 days ago") everywhere. It has no React dependency.
 */

import type {OperatorValue} from './types';
import type {TranslatorFn} from '../i18n';
import {registerEnglishFallback} from '../i18n/englishFallback';
import english from '../i18n/generated-english/PowerSearch/relativeDateOptions.generated';

registerEnglishFallback(english);

const RELATIVE_DATE_UNITS = [
  {
    unit: 'day',
    amounts: [1, 3, 7, 14, 30],
    ago: '@astryx.powersearch.sheet.relativeDaysAgo',
    fromNow: '@astryx.powersearch.sheet.relativeDaysFromNow',
  },
  {
    unit: 'week',
    amounts: [1, 2, 4],
    ago: '@astryx.powersearch.sheet.relativeWeeksAgo',
    fromNow: '@astryx.powersearch.sheet.relativeWeeksFromNow',
  },
  {
    unit: 'month',
    amounts: [1, 3, 6, 12],
    ago: '@astryx.powersearch.sheet.relativeMonthsAgo',
    fromNow: '@astryx.powersearch.sheet.relativeMonthsFromNow',
  },
] as const;

/**
 * The relative-date choices an operator offers, in display order. Shared by
 * the popover's Selector and the sheet presentation's rows so both list the
 * same values. The labels are the catalog's ICU plural messages.
 */
export function buildRelativeDateOptions(
  operatorValue: OperatorValue & {type: 'date_relative'},
  t: TranslatorFn,
): {value: string; label: string}[] {
  const result: {value: string; label: string}[] = [];
  for (const {unit, amounts, ago, fromNow} of RELATIVE_DATE_UNITS) {
    for (const amount of amounts) {
      if (operatorValue.isPastAllowed !== false) {
        result.push({
          value: `${amount}${unit[0]}_ago`,
          label: t(ago, {count: amount}),
        });
      }
      if (operatorValue.isFutureAllowed !== false) {
        result.push({
          value: `${amount}${unit[0]}_from_now`,
          label: t(fromNow, {count: amount}),
        });
      }
    }
  }
  return result;
}

/**
 * A stored relative-date value as the choice that offers it reads ("3 days
 * ago"); a value no choice offers reads as stored.
 */
export function relativeDateLabel(
  operatorValue: OperatorValue & {type: 'date_relative'},
  value: string,
  t: TranslatorFn,
): string {
  return (
    buildRelativeDateOptions(operatorValue, t).find(
      option => option.value === value,
    )?.label ?? value
  );
}
