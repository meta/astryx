// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Grid container',
    required: true,
    description:
      'Two-dimensional layout container that arranges caller-supplied items in rows and columns.',
  },
  {
    name: 'Spanning item',
    required: false,
    description:
      "Optional GridSpan wrapper that changes one item's column or row participation.",
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Grid',
  displayName: 'Grid',
  group: 'Layout',
  category: 'Layout',
  keywords: ["grid","columns","responsive","auto-fill","auto-fit","masonry","tiles","row","col","simplegrid","responsive grid","card grid"],
  usage: {
    anatomy,
    description:
      'A CSS grid layout container for arranging children in rows and columns. Use Grid for card galleries, dashboards, and any multi-column layout. For columns that reflow on small screens, use `columns={{minWidth, max}}`; a numeric `columns` is exactly N columns at every width and never reflows.',
    bestPractices: [
      { guidance: true, description: 'Default to responsive columns for anything that must survive a phone: `columns={{minWidth: 240, max: 4}}` renders at most 4 columns, each at least 240px, and drops to one full-width column when narrow.' },
      { guidance: false, description: 'Use `columns={4}` for a row that must work on small screens; a number never reflows and renders four narrow tracks on a phone. Reserve numbers for rows that must stay fixed, such as a 7-day week.' },
      { guidance: true, description: 'Always pair `minWidth` with `max`: `max` caps the count on wide screens and lets the last column shrink to a narrow container; `{minWidth}` alone overflows a phone narrower than `minWidth`.' },
      { guidance: true, description: 'Use `repeat: \'fill\'` (the default) for consistent item widths. Use `\'fit\'` when items should stretch to fill leftover space.' },
      { guidance: false, description: 'Write manual CSS grid; Grid handles spacing and responsive behavior for you.' },
      { guidance: false, description: 'Use `HStack` with wrapping for grids; use Grid instead.' },
      { guidance: true, description: 'Track templates use CSS-variable indirection (not raw inline styles), so `xstyle` overrides of `gridTemplateColumns` (including inside `@media` queries) take effect.' },
    ],
  },
  theming: {
    targets: [
      {className: 'astryx-grid', visualProps: ['align', 'columns', 'gap', 'justify']},
      {className: 'astryx-grid-span'},
    ],
  },
  playground: {
    defaults: {
      columns: 3,
      gap: 2,
      children: [
        {__element: 'Card', props: {padding: 4}, children: 'Item 1'},
        {__element: 'Card', props: {padding: 4}, children: 'Item 2'},
        {__element: 'Card', props: {padding: 4}, children: 'Item 3'},
      ],
    },
  },
  description: 'Grid container with fixed or responsive columns; `{minWidth, max}` reflows, a number never does.',
  props: [
    {
      name: 'columns',
      type: "number | {minWidth: number, max?: number, repeat?: 'fill' | 'fit'}",
      description: 'Column configuration. A number creates exactly N `1fr` tracks at every width and never reflows (e.g. `columns={3}`); a child\'s minimum content may widen its track. For columns that reflow on small screens, use `{minWidth, max}`. Use an object for responsive columns: `minWidth` sets the minimum column width in px, `repeat` controls track behavior (`"fill"` preserves empty tracks for consistent widths, `"fit"` collapses empty tracks so items stretch; defaults to `"fill"`), and `max` caps the maximum number of columns.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description: 'Container width. Numbers are treated as pixels, strings are used as-is.',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description: 'Container height. Numbers are treated as pixels, strings are used as-is.',
    },
    {
      name: 'maxWidth',
      type: 'SizeValue',
      description: 'Maximum container width. Numbers are treated as pixels, strings are used as-is.',
    },
    {
      name: 'minHeight',
      type: 'SizeValue',
      description: 'Minimum container height. Numbers are treated as pixels, strings are used as-is.',
    },
    {
      name: 'gap',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description: 'Spacing between all items.',
    },
    {
      name: 'rowGap',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description: 'Row spacing; overrides `gap` for the row axis.',
    },
    {
      name: 'columnGap',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description: 'Column spacing; overrides `gap` for the column axis.',
    },
    {
      name: 'rowHeight',
      type: 'number',
      description:
        'Height of each implicit row track in pixels. Pair with `GridSpan rows={N}` for masonry-style layouts.',
    },
    {
      name: 'align',
      type: "'start' | 'center' | 'end' | 'stretch'",
      description: 'Vertical alignment of items.',
      default: "'stretch'",
    },
    {
      name: 'justify',
      type: "'start' | 'center' | 'end' | 'stretch'",
      description: 'Horizontal alignment of items.',
      default: "'stretch'",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Grid content.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [
    {name: 'GridSpan'},
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    anatomy,
    description:
      'A CSS grid layout container for arranging children in rows and columns. Use Grid for card galleries, dashboards, and any multi-column layout. For columns that reflow on small screens, use `columns={{minWidth, max}}`; a numeric `columns` is exactly N columns at every width and never reflows.',
    bestPractices: [
      { guidance: true, description: 'Default to responsive columns for anything that must survive a phone: `columns={{minWidth: 240, max: 4}}` renders at most 4 columns, each at least 240px, and drops to one full-width column when narrow.' },
      { guidance: false, description: 'Use `columns={4}` for a row that must work on small screens; a number never reflows and renders four narrow tracks on a phone. Reserve numbers for rows that must stay fixed, such as a 7-day week.' },
      { guidance: true, description: 'Always pair `minWidth` with `max`: `max` caps the count on wide screens and lets the last column shrink to a narrow container; `{minWidth}` alone overflows a phone narrower than `minWidth`.' },
      { guidance: true, description: 'Use `repeat: \'fill\'` (the default) for consistent item widths. Use `\'fit\'` when items should stretch to fill leftover space.' },
      { guidance: false, description: 'Write manual CSS grid; Grid handles spacing and responsive behavior for you.' },
      { guidance: false, description: 'Use `HStack` with wrapping for grids; use Grid instead.' },
      { guidance: true, description: 'Track templates use CSS-variable indirection (not raw inline styles), so `xstyle` overrides of `gridTemplateColumns` (including inside `@media` queries) take effect.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'CSS Grid-based layout w/ responsive column support.',
  usage: {
    anatomy,
    description: 'A CSS grid layout container for arranging children in rows and columns. Use Grid for card galleries, dashboards, and any multi-column layout. For columns that reflow on small screens, use `columns={{minWidth, max}}`; a numeric `columns` is exactly N columns at every width and never reflows.',
    bestPractices: [
      { guidance: true, description: 'Default to responsive columns for anything that must survive a phone: columns={{minWidth: 240, max: 4}} = at most 4 columns, each >= 240px, one full-width column when narrow.' },
      { guidance: false, description: 'Use columns={4} for rows that must work on small screens; a number never reflows (4 narrow tracks on a phone). Numbers only for rows that must stay fixed, e.g. a 7-day week.' },
      { guidance: true, description: 'Always pair minWidth with max: max caps the count on wide screens and lets the last column shrink to a narrow container; {minWidth} alone overflows a phone narrower than minWidth.' },
      { guidance: true, description: 'Use repeat: \'fill\' (the default) for consistent item widths. Use \'fit\' when items should stretch to fill leftover space.' },
      { guidance: false, description: 'Write manual CSS grid; Grid handles spacing and responsive behavior for you.' },
      { guidance: false, description: 'Use HStack with wrapping for grids; use Grid instead.' },
      { guidance: true, description: 'track templates use CSS-var indirection, not inline styles, so xstyle/@media overrides of gridTemplateColumns work.' },
    ],
  },
};
