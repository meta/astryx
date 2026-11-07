// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useCalendarConstraints',
  name: 'useCalendarConstraints — Hotel Booking Grid',
  displayName: 'useCalendarConstraints — Hotel Booking Grid',
  description:
    'A custom booking day grid driven by one isDateDisabled check: past dates and dates after the season are disabled, Mondays are closed, and once a check-in is picked the range anchor caps stays at a 7-day window. Disabled days look disabled and refuse the pick.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Button', 'Layout', 'Text'],
};
