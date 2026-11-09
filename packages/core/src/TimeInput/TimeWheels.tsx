// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TimeWheels.tsx
 * @input A time of day, the hour format, the bounds and a commit callback
 * @output Exports TimeWheels: UIDatePicker's `.time` wheels as one picker
 * @position Internal component; the wheels under a finger in the TimeInput
 *   sheet and DateTimeInput's time panel. timeWheelRules.ts holds the rules.
 *
 * A column that moves by itself turns on the Wheel's own spin (`spinTo`). The
 * spin starts before the commit, so the new value finds the column moving.
 *
 * SYNC: When modified, update TimeWheels.test.tsx, timeWheelRules.ts,
 * TimeInput.doc.mjs and DateTimeInput.doc.mjs.
 */

import {useMemo, useRef} from 'react';
import {Wheel, type WheelHandle} from '../DateInput/Wheel';
import type {ISOTimeString} from '../utils/timeParser';
import {
  columnValue,
  columnsToTurn,
  displayedTime,
  restingTime,
  hourRows,
  meridiemOf,
  meridiemRows,
  minuteRows,
  secondRows,
  turnColumn,
  wheelBounds,
  type TimeColumn,
  type TimeParts,
  type TimeRow,
} from './timeWheelRules';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/TimeInput/TimeWheels.generated';

registerEnglishFallback(english);

export interface TimeWheelsProps {
  /** The time the wheels show. */
  time: TimeParts;
  /** 12-hour (with an AM/PM column) or 24-hour time. */
  hourFormat: '12h' | '24h';
  /** Whether a seconds column shows. */
  hasSeconds: boolean;
  /** Earliest time that may commit. */
  min?: ISOTimeString;
  /** Latest time that may commit. */
  max?: ISOTimeString;
  /** False while the wheels are hidden. */
  isActive: boolean;
  /** Called with the committed time, already inside the bounds. */
  onCommit: (time: TimeParts) => void;
}

function sameTime(a: TimeParts, b: TimeParts): boolean {
  return a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

/**
 * UIDatePicker's time wheels.
 *
 * @example
 * ```
 * <TimeWheels time={{hour: 11, minute: 58, second: 0}} hourFormat="12h"
 *   hasSeconds={false} isActive onCommit={setTime} />
 * ```
 */
export function TimeWheels({
  time,
  hourFormat,
  hasSeconds,
  min,
  max,
  isActive,
  onCommit,
}: TimeWheelsProps) {
  const t = useComponentTranslator();
  const bounds = useMemo(() => wheelBounds(min, max), [min, max]);
  const shown = displayedTime(time, hasSeconds);

  const hourOptions = useMemo(
    () => hourRows(shown.hour, hourFormat, bounds),
    [shown.hour, hourFormat, bounds],
  );
  const minuteOptions = useMemo(
    () => minuteRows(shown.hour, hasSeconds, bounds),
    [shown.hour, hasSeconds, bounds],
  );
  const secondOptions = useMemo(
    () => secondRows(shown.hour, shown.minute, bounds),
    [shown.hour, shown.minute, bounds],
  );
  const meridiemOptions = useMemo(
    () =>
      meridiemRows(
        {
          am: t('@astryx.dateTimeInput.meridiemAM'),
          pm: t('@astryx.dateTimeInput.meridiemPM'),
        },
        bounds,
      ),
    [t, bounds],
  );

  const hourRef = useRef<WheelHandle | null>(null);
  const minuteRef = useRef<WheelHandle | null>(null);
  const secondRef = useRef<WheelHandle | null>(null);
  const meridiemRef = useRef<WheelHandle | null>(null);

  const rows: Record<TimeColumn, TimeRow[]> = {
    hour: hourOptions,
    minute: minuteOptions,
    second: secondOptions,
    meridiem: meridiemOptions,
  };
  // The rows the columns turn onto by themselves (`spinTo`), each with the id of
  // its turn. A turn's arrival is not a person's rest, so it commits nothing,
  // even when the owner kept the old time.
  const spinsRef = useRef<
    Partial<Record<TimeColumn, {value: number; id: number}>>
  >({});
  const nextSpinIdRef = useRef(0);

  const restOn = (column: TimeColumn) => (value: number) => {
    if (spinsRef.current[column]?.value === value) {
      return;
    }
    const from = shown;
    // What commits is the row the wheels come to rest on: past a bound, the
    // nearest time inside it that has a row (datePicker.wheels.restPastBound).
    const next = restingTime(
      turnColumn(from, column, value, hourFormat),
      hasSeconds,
      bounds,
    );
    const handles: Record<TimeColumn, WheelHandle | null> = {
      hour: hourRef.current,
      minute: minuteRef.current,
      second: secondRef.current,
      meridiem: meridiemRef.current,
    };
    // Turn the other columns first, so the commit's new value finds them
    // already moving (a Wheel never parks a moving column).
    for (const turn of columnsToTurn(from, column, value, next, {
      hourFormat,
      hasSeconds,
    })) {
      const index = rows[turn.column].findIndex(
        row => row.value === turn.value,
      );
      const handle = handles[turn.column];
      if (index >= 0 && handle != null) {
        nextSpinIdRef.current += 1;
        const id = nextSpinIdRef.current;
        spinsRef.current[turn.column] = {value: turn.value, id};
        void handle.spinTo(index).finally(() => {
          if (spinsRef.current[turn.column]?.id === id) {
            spinsRef.current[turn.column] = undefined;
          }
        });
      }
    }
    if (!sameTime(next, from)) {
      onCommit(next);
    }
  };

  return (
    <>
      <Wheel
        ref={hourRef}
        label={t('@astryx.dateTimeInput.hourWheel')}
        options={hourOptions}
        value={columnValue(shown, 'hour', hourFormat)}
        isActive={isActive}
        onChange={restOn('hour')}
      />
      <Wheel
        ref={minuteRef}
        label={t('@astryx.dateTimeInput.minuteWheel')}
        options={minuteOptions}
        value={shown.minute}
        isActive={isActive}
        onChange={restOn('minute')}
      />
      {hasSeconds && (
        <Wheel
          ref={secondRef}
          label={t('@astryx.dateTimeInput.secondWheel')}
          options={secondOptions}
          value={shown.second}
          isActive={isActive}
          onChange={restOn('second')}
        />
      )}
      {hourFormat === '12h' && (
        <Wheel
          ref={meridiemRef}
          label={t('@astryx.dateTimeInput.meridiemWheel')}
          options={meridiemOptions}
          value={meridiemOf(shown.hour)}
          isActive={isActive}
          onChange={restOn('meridiem')}
        />
      )}
    </>
  );
}

TimeWheels.displayName = 'TimeWheels';
