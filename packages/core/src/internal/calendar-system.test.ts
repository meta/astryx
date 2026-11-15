// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file calendar-system.test.ts
 * @input The internal `internal/calendar-system` entry and the i18n module
 * @output Proof that the entry re-exports Core's own calendar resolution, by
 *   name, and that the public i18n barrel does not export it
 * @position Unit tests of packages/core/src/internal/calendar-system.ts
 */
import {describe, expect, it} from 'vitest';

describe('internal/calendar-system', () => {
  it('re-exports the hook and the helpers that Core date components use, and nothing else', async () => {
    const entry: Record<string, unknown> = await import('./calendar-system');
    const hook = await import('../i18n/useCalendarSystem');
    const helpers = await import('../utils/calendarSystem');
    expect(entry.useCalendarSystem).toBe(hook.useCalendarSystem);
    expect(entry.calendarMonthLabelDay).toBe(helpers.calendarMonthLabelDay);
    expect(entry.calendarMonthOf).toBe(helpers.calendarMonthOf);
    expect(entry.formatCalendarDate).toBe(helpers.formatCalendarDate);
    expect(entry.formatCalendarDateToParts).toBe(
      helpers.formatCalendarDateToParts,
    );
    expect(entry.formatCalendarInstantRange).toBe(
      helpers.formatCalendarInstantRange,
    );
    expect(Object.keys(entry).sort()).toEqual([
      'calendarMonthLabelDay',
      'calendarMonthOf',
      'formatCalendarDate',
      'formatCalendarDateToParts',
      'formatCalendarInstantRange',
      'useCalendarSystem',
    ]);
  });

  it('the public i18n barrel does not export the hook', async () => {
    const pub: Record<string, unknown> = await import('../i18n');
    expect(pub).not.toHaveProperty('useCalendarSystem');
  });
});
