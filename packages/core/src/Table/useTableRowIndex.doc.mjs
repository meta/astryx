// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableRowIndex',
  subComponentOf: 'Table',
  displayName: 'useTableRowIndex',
  description:
    'Hook that returns a TablePlugin which prepends a right-aligned, monospaced row-number column, starting at 1 by default. Without data, Table supplies row positions; with data, ordinary numbers follow that array. Windowed rows use the parent Table logical position directly; nondefault startFrom values use full rendering.',
  props: [
    {
      name: 'data',
      type: 'T[]',
      description:
        'Optional: the array whose order the numbers follow. Omit it to number rows from the positions Table gives them.',
    },
    {
      name: 'getRowKey',
      type: '(item: T) => string',
      description:
        'Optional key extractor used with data, returning a unique string per row. When provided, rows match data by the returned string; otherwise by reference identity. Memoize with useCallback for a stable plugin identity.',
    },
    {
      name: 'label',
      type: 'ReactNode',
      description: 'Header label for the index column.',
      default: "'#'",
    },
    {
      name: 'startFrom',
      type: 'number',
      description: 'First index value.',
      default: '1',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Returns a TablePlugin with a right-aligned monospaced row-number column, 1-based by default. Without data, Table supplies positions; with data, ordinary numbers follow it. Windowed rows use the parent logical position, and nondefault startFrom falls back to full rendering.',
  propDescriptions: {
    data: 'Optional array whose order ordinary numbers follow; omit to use Table row positions.',
    getRowKey:
      'Optional key extractor used with data; otherwise items match by reference.',
    label: "Header label for the index column. Default '#'.",
    startFrom: 'First index value. Default 1.',
  },
};
