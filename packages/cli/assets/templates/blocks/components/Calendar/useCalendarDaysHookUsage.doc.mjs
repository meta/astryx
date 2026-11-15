// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useCalendarDays',
  name: 'useCalendarDays — Month Grid',
  displayName: 'useCalendarDays — Month Grid',
  description:
    'A compact custom month view: a seven-column table built from the weeks and dayNames that useCalendarDays returns, with only as many rows as the month needs. Days from the previous and next months are dimmed, and a Week starts on control (Sunday or Monday) reorders both the header and the grid.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['SegmentedControl', 'Layout', 'Text'],
};
