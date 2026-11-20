// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file localeTextDirection.test.ts
 * @input BCP 47 locale tags
 * @output The direction formatted text reads in, per locale
 * @position Colocated tests for localeTextDirection.ts
 */

import {describe, expect, it} from 'vitest';
import {localeTextDirection} from './localeTextDirection';

describe('localeTextDirection', () => {
  it.each([
    ['en-US', 'ltr'],
    ['de-DE', 'ltr'],
    ['ar-EG', 'rtl'],
    ['he-IL', 'rtl'],
    ['fa-IR', 'rtl'],
  ])('reads %s text as %s', (locale, direction) => {
    expect(localeTextDirection(locale)).toBe(direction);
  });

  it('lets the text decide when the tag does not parse', () => {
    expect(localeTextDirection('not a locale')).toBe('auto');
  });
});
