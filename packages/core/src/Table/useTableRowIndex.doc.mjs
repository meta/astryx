// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableRowIndex',
  subComponentOf: 'Table',
  displayName: 'useTableRowIndex',
  description:
    'Hook that returns a TablePlugin which prepends a right-aligned, monospaced row-number column. Numbering starts at 1 by default. Windowed rows use the parent Table logical position directly; ordinary tables derive ordinals from the supplied rendered data array, preserving sort/filter/pagination order. Custom startFrom values use ordinary full rendering.',
  props: [
    {
      name: 'data',
      type: 'T[]',
      description:
        'The data array currently rendered by the table (post sort/filter/page). Numbering follows this order.',
      required: true,
    },
    {
      name: 'getRowKey',
      type: '(item: T) => string',
      description:
        'Optional key extractor returning a unique string per row. When provided, index lookup is keyed by the returned string; otherwise items are matched by reference identity. Memoize with useCallback for a stable plugin identity.',
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
    'Returns a TablePlugin with a right-aligned monospaced row-number column, 1-based by default. Windowed rows consume the parent Table logical position; ordinary tables derive ordinals from the rendered data array. Custom startFrom falls back to full rendering.',
  propDescriptions: {
    data: 'The rendered data array (post sort/filter/page). Numbering follows this order.',
    getRowKey:
      'Optional key extractor returning a unique string per row; otherwise items match by reference.',
    label: "Header label for the index column. Default '#'.",
    startFrom: 'First index value. Default 1.',
  },
};
