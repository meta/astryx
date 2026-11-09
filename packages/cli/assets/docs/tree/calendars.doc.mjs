// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs calendars`: calendar systems in detail. Which calendars
 * date components show, how to load Temporal, server rendering, and the
 * lunisolar calendars. The `internationalization/i18n-calendars` guide has the
 * short version.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'calendars',
  // The docsite lists guide pages by title, so this one sorts directly below
  // Internationalization, the page that links here.
  title: 'Internationalization: calendars',
  summary:
    'Show dates in the Persian, Hebrew, Islamic, Buddhist, Japanese, lunisolar, and other calendars while values stay Gregorian ISO dates.',
  keywords: [
    'calendar',
    'calendar system',
    'Persian',
    'Jalali',
    'Hebrew',
    'Hijri',
    'Islamic',
    'Buddhist',
    'Japanese era',
    'lunisolar',
    'chinese',
    'dangi',
    'Ethiopian',
    'Temporal',
    'polyfill',
    'u-ca',
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
  blocks: [
    {
      type: 'prose',
      text: '`Calendar`, DateInput, DateRangeInput, and DateTimeInput show the Gregorian calendar unless the application chooses another one. Values never change with the calendar: they stay Gregorian ISO dates. {@link generic:i18n-calendars} has the short version.',
    },
  ],
};
