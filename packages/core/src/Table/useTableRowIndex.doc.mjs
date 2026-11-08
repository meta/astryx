// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableRowIndex',
  subComponentOf: 'Table',
  displayName: 'useTableRowIndex',
  description:
    'Hook that returns a TablePlugin which prepends a right-aligned, monospaced row-number column. Numbering follows the rows the table renders (reflecting the current sort / filter / pagination view) and starts at 1 by default. Without data, Table gives each row its position; with data, numbers follow that array.',
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
    'Returns a TablePlugin that prepends a right-aligned monospaced row-number column. Numbering follows the rendered rows (current sort/filter/page view), 1-based by default. Without data, Table supplies each row position; with data, numbers follow it.',
  propDescriptions: {
    data: 'Optional array whose order the numbers follow; omit to use Table row positions.',
    getRowKey: 'Optional key extractor used with data; otherwise items match by reference.',
    label: "Header label for the index column. Default '#'.",
    startFrom: 'First index value. Default 1.',
  },
};
