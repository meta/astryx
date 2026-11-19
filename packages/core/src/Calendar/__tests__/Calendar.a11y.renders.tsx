// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Calendar.a11y.renders.tsx
 * @input One Calendar binding state
 * @output The React tree every lane renders for that state (the jsdom test directly, the story through Storybook)
 * @position Shared fixture for the Calendar grid binding
 */

import {useState, type ReactElement} from 'react';
import {Calendar} from '../Calendar';
import type {DateRange, ISODateString} from '../Calendar';
import {START_ISO, type CalendarBindingState} from './Calendar.a11y.states';

function BoundCalendar({state}: {state: CalendarBindingState}) {
  const [single, setSingle] = useState<ISODateString | null>(
    state.mode === 'single' && typeof state.value === 'string'
      ? state.value
      : null,
  );
  const [range, setRange] = useState<DateRange | null>(
    state.mode === 'range' && typeof state.value === 'object'
      ? state.value
      : null,
  );
  if (state.mode === 'range') {
    return (
      <Calendar
        mode="range"
        value={range}
        onChange={setRange}
        focusDate={START_ISO}
        numberOfMonths={state.numberOfMonths ?? 1}
      />
    );
  }
  return (
    <Calendar
      mode="single"
      value={single}
      onChange={setSingle}
      focusDate={START_ISO}
      numberOfMonths={state.numberOfMonths ?? 1}
      hasWeekNumbers={state.hasWeekNumbers}
    />
  );
}

export function renderCalendarState(state: CalendarBindingState): ReactElement {
  return (
    <div dir={state.rtl ? 'rtl' : 'ltr'} style={{padding: 16}}>
      <BoundCalendar state={state} />
    </div>
  );
}
