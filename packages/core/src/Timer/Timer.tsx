// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Timer.tsx
 * @input Uses an optional start time, standardized format, Timestamp typography, BaseProps, and React ref
 * @output Exports Timer, TimerProps, and TimerFormat with non-rendering elapsed-time updates
 * @position Core content primitive for elapsed duration in active operations
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /docs/specs/components/Timer/Timer.spec.md
 * - /packages/core/src/Timer/Timer.doc.mjs
 * - /packages/core/src/Timer/Timer.test.tsx
 * - /packages/core/src/Timer/index.ts
 * - /apps/storybook/stories/Timer.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Timer/
 */

import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {Text} from '../Text';
import type {TextColor, TextSize, TextType, TextWeight} from '../theme/types';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
const ONE_HOUR_SECONDS = 60 * 60;
const MAX_TIMEOUT_MS = 2_147_483_647;

const styles = stylex.create({
  time: {
    color: 'inherit',
    display: 'inline',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontStyle: 'normal',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
  },
});

export type TimerFormat = 'elapsed' | 'clock';

type TimerPresentation = {
  dateTime: string;
  text: string;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function resolveFormat(format: TimerFormat): TimerFormat {
  return format === 'clock' ? 'clock' : 'elapsed';
}

function getElapsedMilliseconds(now: number, startTime: number): number {
  return Math.max(0, now - startTime);
}

function getPresentation(
  elapsedMilliseconds: number,
  format: TimerFormat,
): TimerPresentation {
  const elapsedSeconds = Math.floor(elapsedMilliseconds / ONE_SECOND_MS);

  if (format === 'clock') {
    const hours = Math.floor(elapsedSeconds / ONE_HOUR_SECONDS);
    const minutes = Math.floor((elapsedSeconds % ONE_HOUR_SECONDS) / 60);
    const seconds = elapsedSeconds % 60;
    return {
      dateTime: `PT${elapsedSeconds}S`,
      text:
        hours > 0
          ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
          : `${String(minutes)}:${pad(seconds)}`,
    };
  }

  if (elapsedSeconds < 60) {
    return {
      dateTime: `PT${elapsedSeconds}S`,
      text: `${String(elapsedSeconds)}s`,
    };
  }

  const totalMinutes = Math.floor(elapsedSeconds / 60);
  if (totalMinutes < 60) {
    return {
      dateTime: `PT${elapsedSeconds}S`,
      text: `${String(totalMinutes)}m ${pad(elapsedSeconds % 60)}s`,
    };
  }

  const representedSeconds = totalMinutes * 60;
  return {
    dateTime: `PT${representedSeconds}S`,
    text: `${String(Math.floor(totalMinutes / 60))}h ${pad(totalMinutes % 60)}m`,
  };
}

function getMillisecondsUntilNextChange(
  now: number,
  startTime: number,
  elapsedMilliseconds: number,
  format: TimerFormat,
): number {
  if (now < startTime) {
    return Math.min(startTime - now + ONE_SECOND_MS, MAX_TIMEOUT_MS);
  }

  const precision =
    format === 'elapsed' &&
    elapsedMilliseconds >= ONE_HOUR_SECONDS * ONE_SECOND_MS
      ? ONE_MINUTE_MS
      : ONE_SECOND_MS;
  return precision - (elapsedMilliseconds % precision);
}

export interface TimerProps extends Omit<
  BaseProps<HTMLTimeElement>,
  'dateTime'
> {
  /** Ref forwarded to the rendered `<time>` element. */
  ref?: React.Ref<HTMLTimeElement>;
  /**
   * Unix time in milliseconds when the measured operation began. Omit it to
   * start counting from this Timer's mount.
   */
  startTime?: number;
  /**
   * Standard duration representation.
   * @default 'elapsed'
   */
  format?: TimerFormat;
  /**
   * Semantic text type. Matches Timestamp typography behavior.
   * @default 'supporting'
   */
  type?: TextType;
  /** Explicit font size override. Overrides the size from `type`. */
  size?: TextSize;
  /**
   * Text color.
   * @default 'secondary'
   */
  color?: TextColor;
  /** Font weight override. */
  weight?: TextWeight;
}

/**
 * Displays a standardized elapsed duration without scheduling React tick renders.
 *
 * Timer writes changing text and its ISO 8601 duration directly to the owned
 * `<time>` node. Use `elapsed` for compact duration text or `clock` for a
 * stopwatch-like reading.
 *
 * @example
 * ```
 * <Timer />
 * <Timer format="clock" />
 * ```
 */
export function Timer({
  startTime,
  format = 'elapsed',
  type = 'supporting',
  size,
  color = 'secondary',
  weight,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: TimerProps) {
  const [mountTime] = useState(() => Date.now());
  const timerRef = useRef<HTMLTimeElement>(null);
  const mergedRef = useMergedRefs(ref, timerRef);
  const resolvedFormat = resolveFormat(format);
  const initialPresentation = getPresentation(0, resolvedFormat);

  useEffect(() => {
    const resolvedStartTime =
      startTime !== undefined && Number.isFinite(startTime)
        ? startTime
        : mountTime;
    let timeoutID: ReturnType<typeof setTimeout> | undefined;
    let previousDateTime: string | undefined;
    let previousText: string | undefined;

    const tick = () => {
      const now = Date.now();
      const elapsedMilliseconds = getElapsedMilliseconds(
        now,
        resolvedStartTime,
      );
      const presentation = getPresentation(elapsedMilliseconds, resolvedFormat);
      const node = timerRef.current;

      if (node != null) {
        if (presentation.text !== previousText) {
          node.textContent = presentation.text;
          previousText = presentation.text;
        }
        if (presentation.dateTime !== previousDateTime) {
          node.dateTime = presentation.dateTime;
          previousDateTime = presentation.dateTime;
        }
      }

      timeoutID = setTimeout(
        tick,
        getMillisecondsUntilNextChange(
          now,
          resolvedStartTime,
          elapsedMilliseconds,
          resolvedFormat,
        ),
      );
    };

    tick();
    return () => {
      if (timeoutID !== undefined) {
        clearTimeout(timeoutID);
      }
    };
  }, [mountTime, resolvedFormat, startTime]);

  const timerProps = mergeProps(themeProps('timer'), {className, style});

  return (
    <Text
      type={type}
      size={size}
      color={color}
      weight={weight}
      xstyle={xstyle}
      {...timerProps}>
      <time
        {...rest}
        ref={mergedRef}
        dateTime="PT0S"
        {...stylex.props(styles.time)}>
        {initialPresentation.text}
      </time>
    </Text>
  );
}

Timer.displayName = 'Timer';
