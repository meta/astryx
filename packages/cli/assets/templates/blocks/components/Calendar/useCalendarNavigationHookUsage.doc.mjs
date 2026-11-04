// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useCalendarNavigation',
  name: 'useCalendarNavigation — Custom Month Header and Grid',
  displayName: 'useCalendarNavigation — Custom Month Header and Grid',
  description:
    'A custom month header with Previous/Next buttons and the month-year label from the hook, above a grid of day buttons. Arrow keys move focus day by day; ArrowRight on the last day of the month shows the next month and focuses its first day via pendingFocus and clearPendingFocus.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Button', 'Layout', 'Text'],
};
