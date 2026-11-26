// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LazyCalendar.tsx
 * @input Uses Calendar through the shared module loader
 * @output Exports LazyCalendar, the host of a date field's popover Calendar,
 *   and loadCalendar and isCalendarLoaded, which the field's intent and its
 *   open call use
 * @position Internal surface host for DateInput, DateTimeInput,
 *   DateRangeInput and PowerSearch's date editor
 *
 * The host renders nothing until Calendar has loaded. A field opens its
 * popover only after the load, so the popover never shows without its
 * Calendar. It renders nothing on the server or while the page hydrates;
 * the closed popover holds no Calendar.
 */

import {useSyncExternalStore, type ReactElement} from 'react';
import {warnOnce} from '../utils/devWarning';
import {createModuleLoader} from '../utils/moduleLoader';
import type * as CalendarModule from './Calendar';
import type {CalendarProps} from './Calendar';

const calendar = createModuleLoader<typeof CalendarModule>(
  async () => import('./Calendar'),
  {
    onLoadFailure: () =>
      warnOnce(
        'calendar:load-failed',
        'Calendar',
        "The calendar could not load. Reload the page if it doesn't come back.",
      ),
  },
);

const readCalendar = (): typeof CalendarModule | null => calendar.loaded();
const readNoCalendar = (): null => null;

/**
 * Loads Calendar and resolves whether it loaded. A failed load warns once
 * and is not kept, so the next intent or open asks the loader again. A
 * browser that keeps a failed module keeps the Calendar unavailable until
 * the page reloads.
 */
export async function loadCalendar(): Promise<boolean> {
  return calendar.tryLoad();
}

/** True once Calendar has loaded. */
export function isCalendarLoaded(): boolean {
  return calendar.loaded() != null;
}

export function LazyCalendar(props: CalendarProps): ReactElement | null {
  const loaded = useSyncExternalStore(
    calendar.subscribe,
    readCalendar,
    readNoCalendar,
  );
  if (loaded == null) {
    return null;
  }
  const {Calendar} = loaded;
  return <Calendar {...props} />;
}
