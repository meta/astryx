// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableRowIndex',
  subComponentOf: 'Table',
  displayName: 'useTableRowIndex',
  description:
    'Hook that returns a TablePlugin which prepends a right-aligned, monospaced row-number column. Numbering follows the rows the table renders (reflecting the current sort / filter / pagination view) and starts at 1 by default. Table gives each row its position, so the plugin needs no data.',
  props: [
    {
      name: 'data',
      type: 'T[]',
      description:
        'Optional fallback: the data array the table renders (post sort/filter/page). Only an index cell rendered outside the table body rows uses it.',
    },
    {
      name: 'getRowKey',
      type: '(item: T) => string',
      description:
        'Optional key extractor for the data fallback, returning a unique string per row. When provided, the fallback matches rows by the returned string; otherwise by reference identity. Memoize with useCallback for a stable plugin identity.',
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
    'Returns a TablePlugin that prepends a right-aligned monospaced row-number column. Numbering follows the rendered rows (current sort/filter/page view), 1-based by default. Table supplies each row position; no data needed.',
  propDescriptions: {
    data: 'Optional fallback data array, for an index cell outside the table body rows.',
    getRowKey: 'Optional key extractor for the data fallback; otherwise items match by reference.',
    label: "Header label for the index column. Default '#'.",
    startFrom: 'First index value. Default 1.',
  },
};
