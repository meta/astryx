// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolveDateTimeRangePart} from './resolveDateTimeRangePart';

const NOW_SECONDS = 2_000_000_000.75;

describe('resolveDateTimeRangePart', () => {
  it('resolves NOW from the supplied evaluation time', () => {
    expect(resolveDateTimeRangePart({type: 'NOW'}, NOW_SECONDS)).toBe(
      2_000_000_000,
    );
  });

  it('preserves an absolute timestamp', () => {
    expect(
      resolveDateTimeRangePart(
        {type: 'ABSOLUTE', unixSeconds: 1_700_000_000},
        NOW_SECONDS,
      ),
    ).toBe(1_700_000_000);
  });

  it.each([
    ['second', 1],
    ['minute', 60],
    ['hour', 3_600],
    ['day', 86_400],
    ['week', 604_800],
    ['month', 2_592_000],
    ['year', 31_536_000],
  ] as const)('resolves relative %s values', (unit, seconds) => {
    expect(
      resolveDateTimeRangePart(
        {type: 'RELATIVE', backValue: 2, unit},
        NOW_SECONDS,
      ),
    ).toBe(Math.floor(NOW_SECONDS - 2 * seconds));
  });
});
