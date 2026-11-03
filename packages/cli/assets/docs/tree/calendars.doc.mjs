// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs internationalization/calendars`: calendar systems in
 * detail. Which calendars date components show, how to load Temporal, server
 * rendering, and the Chinese and Korean calendars. The `i18n-calendars` guide
 * beside it has the short version.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'calendars',
  placement: {
    parent: 'namespace:internationalization',
    slot: 'guides',
    order: 26,
  },
  title: 'Calendars',
  summary:
    'Show dates in the Persian, Hebrew, Islamic, Buddhist, Japanese, Chinese, and other calendars while values stay Gregorian ISO dates.',
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
    'Chinese',
    'Korean',
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
      text: 'Date components show the Gregorian calendar unless the application chooses another one. Values never change with the calendar: they stay Gregorian ISO dates. {@link generic:i18n-calendars} has the short version.',
    },
  ],
};
