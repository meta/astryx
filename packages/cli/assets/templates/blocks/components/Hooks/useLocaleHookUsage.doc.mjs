// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useLocale',
  name: 'useLocale — Invoice Summary',
  displayName: 'useLocale — Invoice Summary',
  description:
    'An invoice summary that formats its date and amount with Intl using the locale from useLocale, so switching the provider from English to German changes "Nov 2, 2026" and "$1,234.50" to "2. Nov. 2026" and "1.234,50 $" with no second locale source.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'InternationalizationProvider',
    'Card',
    'SegmentedControl',
    'Text',
    'Layout',
  ],
};
