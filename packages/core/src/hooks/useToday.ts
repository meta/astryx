// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useToday.ts
 * @input Uses React useSyncExternalStore and the browser's local date
 * @output Exports useToday (internal; not re-exported from hooks/index.ts)
 * @position Internal utility; the one render-time reader of today's date for
 *   Calendar and the date fields
 *
 * Today's date depends on the clock and the time zone, which a server and a
 * browser do not share. So today is unknown (`null`) during server render and
 * during the client render that hydrates server HTML, and is the browser's
 * local date in every other client render. Hydration then matches the server
 * markup, and the next render shows today.
 */

import {useMemo, useSyncExternalStore} from 'react';
import {
  plainDateFromISO,
  plainDateToISO,
  plainDateToday,
  type PlainDate,
} from '../utils/plainDate';

// A render reads the current date, so there is nothing to subscribe to.
const subscribe = () => () => {};
// A string snapshot stays equal for the whole day.
const getSnapshot = () => plainDateToISO(plainDateToday());
const getServerSnapshot = () => null;

/**
 * Returns the browser's local date, or `null` during server render and the
 * render that hydrates server HTML.
 */
export function useToday(): PlainDate | null {
  const iso = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => (iso == null ? null : plainDateFromISO(iso)), [iso]);
}
