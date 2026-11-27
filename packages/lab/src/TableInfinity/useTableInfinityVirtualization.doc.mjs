// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export default {
  type: 'function',
  name: 'useTableInfinityVirtualization',
  displayName: 'useTableInfinityVirtualization',
  importPath: '@astryxdesign/lab',
  relatedComponents: ['Table'],
  params: [
    {
      name: 'options',
      type: 'TableInfinityOptions<T>',
      description:
        'Supply positive row and column counts, fixed rowHeight, columnWidth and headerHeight, and body viewportWidth and viewportHeight in whole CSS pixels. Provide synchronous getRow and getColumn functions indexed from zero, plus viewportLabel, rowScrollbarLabel and columnScrollbarLabel in the language of your application. Keep the geometry fixed for a mount.',
    },
  ],
  returns: [
    {
      name: 'tableProps',
      type: 'Table window props',
      description:
        'Spread these props on Table. Supply a stable idKey and an accessible name. Do not combine this experiment with Table.virtualization or plugins that change the row or column structure.',
    },
    {
      name: 'scrollToCell',
      type: '(rowIndex: number, columnIndex: number) => void',
      description:
        'Aligns the requested zero-based row and column with the viewport start, clamped at the table boundaries.',
    },
  ],
  usage: {
    description:
      'Experimental two-axis scrolling for read-only, fixed-pitch tables that exceed browser layout limits. Table still renders its native header and body. Wheel and trackpad input scroll nearby cells. Each scrollbar reaches the full range and supports keyboard navigation. Only mounted cells are exposed to assistive technology. Provide non-interactive cell content.',
  },
};
