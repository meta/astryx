// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useToday.ts
 * @input Uses useIsHydrating and the browser's local date
 * @output Exports useToday (internal; not re-exported from hooks/index.ts)
 * @position Internal utility; today's date for Calendar, DateRangeInput and
 *   the sheet date fields
 */

import {useMemo} from 'react';
import {useIsHydrating} from './useIsHydrating';
import {
  plainDateFromISO,
  plainDateToISO,
  plainDateToday,
  type PlainDate,
} from '../utils/plainDate';

/**
 * Returns the browser's local date, or `null` during server render and the
 * render that hydrates server HTML. A server and a browser can be on different
 * dates, so a value read there would not match.
 */
export function useToday(): PlainDate | null {
  // A string stays equal for the whole day, so the memo holds.
  const iso = useIsHydrating() ? null : plainDateToISO(plainDateToday());
  return useMemo(() => (iso == null ? null : plainDateFromISO(iso)), [iso]);
}
