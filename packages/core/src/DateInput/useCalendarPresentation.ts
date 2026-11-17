// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCalendarPresentation.ts
 * @input A date component's `calendar`, `presentation`, and `nativePicker`
 * @output The resolved calendar and the presentation policy it allows
 * @position DateInput helper hook; used by DateInput and DateTimeInput to
 *   choose a surface. Warns once when an explicit `native` cannot apply.
 */

import {useEffect} from 'react';
import {useCalendarSystem} from '../i18n/useCalendarSystem';
import {
  type CalendarSystem,
  isGregorianCalendar,
} from '../utils/calendarSystem';
import {warnOnce} from '../utils/devWarning';
import {
  type LegacyNativePicker,
  type PickerPresentation,
  calendarPickerPresentation,
  effectivePickerPresentation,
} from '../utils/inputPresentation';

export interface CalendarPresentation {
  /** The calendar the component shows. */
  calendar: CalendarSystem;
  /** The presentation policy, with native surfaces replaced in a calendar the native control cannot show. */
  presentation: PickerPresentation;
}

export function useCalendarPresentation(
  source: string,
  calendarProp: CalendarSystem | undefined,
  presentation: PickerPresentation | undefined,
  nativePicker: LegacyNativePicker | undefined,
): CalendarPresentation {
  const calendar = useCalendarSystem(calendarProp, source);
  const isNativeCalendar = isGregorianCalendar(calendar);
  const isNativeOverridden = presentation === 'native' && !isNativeCalendar;
  // Synchronizes the development console. The key is the component and
  // calendar, so a replay or a second field does not warn again.
  useEffect(() => {
    if (isNativeOverridden) {
      warnOnce(
        `presentation-native-calendar:${source}:${calendar}`,
        source,
        `presentation="native" shows the Astryx picker in the "${calendar}" ` +
          'calendar, because the native date control shows only Gregorian ' +
          'dates: the popover on a fine pointer and the bottom sheet on a ' +
          'coarse pointer.',
      );
    }
  }, [isNativeOverridden, source, calendar]);
  return {
    calendar,
    presentation: calendarPickerPresentation(
      effectivePickerPresentation(presentation, nativePicker),
      isNativeCalendar,
    ),
  };
}
