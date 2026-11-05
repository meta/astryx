// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Table',
    required: true,
    description:
      'Semantic table element that groups the table sections, rows, and cells.',
  },
  {
    name: 'Scroll region',
    required: true,
    description:
      'Outer region that scrolls horizontally, enters the keyboard order, and contains overscroll only while the columns overflow.',
  },
  {
    name: 'Header section',
    required: false,
    description:
      'Column-heading section generated when data-driven columns are present or supplied with TableHeader in children mode.',
  },
  {
    name: 'Column header cell',
    required: false,
    description:
      'Cell that identifies one column and may contain sorting or bulk-selection controls.',
  },
  {
    name: 'Sort control',
    required: false,
    description:
      "Button that wraps a sortable column label and changes that column's sort direction.",
  },
  {
    name: 'Sort indicator glyph',
    required: false,
    description: 'Directional symbol rendered by Icon inside a Sort control.',
  },
  {
    name: 'Sort priority',
    required: false,
    description:
      'Number shown for a sorted column when multi-column sorting is active.',
  },
  {
    name: 'Selection control',
    required: false,
    description:
      'CheckboxInput rendered in the header and selectable body rows by the selection plugin.',
  },
  {
    name: 'Body section',
    required: true,
    description:
      'Section containing data rows or the current empty state; data-driven mode renders it automatically.',
  },
  {
    name: 'Row',
    required: false,
    description:
      'Repeated TableRow that groups cells in a standard header, body, or footer row.',
  },
  {
    name: 'Cell',
    required: false,
    description:
      'TableCell containing one value or caller-provided content in a standard body or footer row.',
  },
  {
    name: 'Default empty state',
    required: false,
    description:
      'Compact EmptyState shown for an empty data array unless it is replaced or disabled.',
  },
  {
    name: 'Expansion control',
    required: false,
    description:
      'Button in a leading cell that expands or collapses one expandable row.',
  },
  {
    name: 'Expansion glyph',
    required: false,
    description:
      'Directional symbol rendered by Icon inside an Expansion control.',
  },
  {
    name: 'Expanded detail panel',
    required: false,
    description:
      'Detail row and spanning cell rendered below an expanded row around caller-provided content.',
  },
  {
    name: 'Footer section',
    required: false,
    description:
      'Optional summary or totals section supplied with TableFooter in children mode.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Table',
  displayName: 'Table',
  group: 'Table',
  category: 'Table & List',
  keywords: [
    'table',
    'datatable',
    'datagrid',
    'spreadsheet',
    'sorting',
    'virtualized',
    'columns',
    'rows',
    'selection',
    'pinning',
  ],
  playground: {
    defaults: {
      data: [
        {name: 'Alice Chen', role: 'Engineer', status: 'Active'},
        {name: 'Bob Smith', role: 'Designer', status: 'Active'},
        {name: 'Carol Wu', role: 'PM', status: 'Away'},
      ],
      columns: [
        {key: 'name', header: 'Name'},
        {key: 'role', header: 'Role'},
        {key: 'status', header: 'Status'},
      ],
    },
  },
  theming: {
    targets: [
      {className: 'astryx-table'},
      {className: 'astryx-table-scroll-wrapper'},
      {className: 'astryx-table-header'},
      {className: 'astryx-table-body'},
      {className: 'astryx-table-footer'},
      {className: 'astryx-table-row'},
      {className: 'astryx-table-cell', visualProps: ['density']},
      {className: 'astryx-table-header-cell', visualProps: ['density']},
    ],
  },
  description:
    'Styled, data-driven table with density, dividers, hover highlight, striped rows, and named plugin support. T must extend Record<string, unknown>.',
  props: [
    {
      name: 'data',
      type: 'T[]',
      description:
        'Array of data items to render as rows. T must extend Record<string, unknown> (use `interface MyRow extends Record<string, unknown>` for custom types).',
    },
    {
      name: 'columns',
      type: 'TableColumn<T>[]',
      description:
        'Column definitions: each column has {key, header, width?, align?, renderCell?}. The `header` field sets the column heading text. If omitted, columns are auto-generated from data object keys. The `width` field is typed as `ColumnWidth` (not a number); use `proportional(n)` or `pixel(n)` helpers imported from `@astryxdesign/core/Table`. Omitting `width` keeps an equal flexible share with a compact 60px readability floor. To give one column a different floor, set `width: proportional(1, {minWidth: 80})`; its `minWidth` replaces the 60px floor for that column. Example: `width: pixel(120)` for 120px fixed, `width: proportional(1)` for a flexible column with a 120px default minimum.',
    },
    {
      name: 'idKey',
      type: '(keyof T & string) | ((item: T) => string | number)',
      description:
        'Row key for React reconciliation. Pass a property name string or a function. Falls back to row index if omitted.',
    },
    {
      name: 'density',
      type: "'compact' | 'balanced' | 'spacious'",
      description: 'Row density controlling cell padding and font size.',
      default: "'balanced'",
    },
    {
      name: 'dividers',
      type: "'rows' | 'columns' | 'grid' | 'none'",
      description: 'Divider style rendered between cells.',
      default: "'rows'",
    },
    {
      name: 'isStriped',
      type: 'boolean',
      description: 'Applies a background wash to even-numbered rows.',
      default: 'false',
    },
    {
      name: 'hasHover',
      type: 'boolean',
      description:
        'Applies a hover highlight background to rows on pointer devices.',
      default: 'false',
    },
    {
      name: 'verticalAlign',
      type: "'middle' | 'top' | 'bottom'",
      description:
        'Vertical alignment for body row cells. Controls `vertical-align` on the `<td>` elements.',
      default: "'middle'",
    },
    {
      name: 'textOverflow',
      type: "'wrap' | 'truncate'",
      description:
        "How body cell text behaves when it exceeds the column width. 'wrap' lets text wrap and the row grow taller; 'truncate' clips with an ellipsis (default-rendered cells show a tooltip on hover when truncated). Header cells always truncate.",
      default: "'wrap'",
    },
    {
      name: 'plugins',
      type: 'Record<string, TablePlugin<T>>',
      description:
        'Named plugins that extend table behavior via the transform pipeline. Converted to an ordered array internally.',
    },
    {
      name: 'rowIndexStart',
      type: 'number',
      description:
        'ARIA row index (1-based) for the first rendered body row. The row ordinal is an accessibility concern independent of any visible index column, so setting this (or rowCount) makes the table emit aria-rowindex on body rows and aria-rowcount on the table. For a paginated/windowed view, pass the offset of the first visible row (e.g. (page - 1) * pageSize + 1) so aria-rowindex reflects position in the full dataset. Data-driven mode only.',
      default: '1',
    },
    {
      name: 'rowCount',
      type: 'number',
      description:
        'Total number of body rows across all pages/windows, used for aria-rowcount so assistive tech can announce "row X of Y" against the full dataset. When omitted but rowIndexStart is set (windowed view with an unknown total), aria-rowcount is set to -1 per the ARIA unknown-count convention. Data-driven mode only.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Children mode: compose the table yourself from TableHeader / TableBody / TableFooter, each holding TableRow and TableCell, instead of using data-driven rendering. The children are passed straight to the <table>, so the section is yours to supply. A TableRow placed directly in Table emits <table><tr>, which is invalid HTML and mismatches on hydration (the parser inserts an implied <tbody> for server-rendered markup; React does not on the client). Data-driven mode renders the sections for you.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [
    {name: 'TableHeader'},
    {name: 'TableBody'},
    {name: 'TableFooter'},
    {name: 'TableRow'},
    {name: 'TableCell'},
    {name: 'TableHeaderCell'},
    {name: 'useTableSelection'},
    {name: 'useTableSelectionState'},
    {name: 'TableSelectionToolbar'},
    {name: 'useTableSortable'},
    {name: 'useTableTreeData'},
    {name: 'useTableTreeState'},
    {name: 'useTablePagination'},
    {name: 'useTableColumnSettings'},
    {name: 'useTableFiltering'},
    {name: 'useTableFilterState'},
  ],
  usage: {
    description:
      'Table displays structured data in rows and columns with consistent dimensionality. It supports rich cell content, sorting, selection, pagination, and column management through a composable plugin system. Use Table for data sets with uniform structure; for simpler or inconsistent data, consider a list or card layout instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use density and divider variants to match the information density and scanning needs of your data.',
      },
      {
        guidance: true,
        description:
          'Compose rich cell content with Astryx components like Badge, StatusDot, and Avatar via renderCell.',
      },
      {
        guidance: true,
        description:
          'In children mode, put every row inside TableHeader, TableBody, or TableFooter. <table> cannot contain a <tr> directly: the HTML parser inserts an implied <tbody> for server-rendered markup and React does not on the client, so unwrapped rows mismatch on hydration.',
      },
      {
        guidance: true,
        description:
          'Omit width for equal flexible columns with a compact 60px readability floor. Give one column its own floor with proportional(1, {minWidth}), weight columns with proportional(n), and fix widths with pixel(); the Table scroll region activates when the combined floors no longer fit.',
      },
      {
        guidance: true,
        description:
          'Use the data-driven API from React Server Components: proportional(), pixel(), and column definitions without function props are server-safe. Columns using renderCell (or any function prop) need the table wrapped in a "use client" component, since functions cannot cross the server-client boundary.',
      },
      {
        guidance: false,
        description:
          'Use a table for data without consistent columns. Use a list or card layout for heterogeneous content.',
      },
      {
        guidance: false,
        description:
          'Enable every plugin at once. Add only the features your use case requires to keep the interface focused.',
      },
      {
        guidance: false,
        description:
          'Rely on the 60px omitted-width floor when a text-heavy column needs more room; set proportional(1, {minWidth}) on that column instead.',
      },
    ],
    anatomy,
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'Table displays structured data in rows and columns with consistent dimensionality. It supports rich cell content, sorting, selection, pagination, and column management through a composable plugin system. Use Table for data sets with uniform structure; for simpler or inconsistent data, consider a list or card layout instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use density and divider variants to match the information density and scanning needs of your data.',
      },
      {
        guidance: true,
        description:
          'Compose rich cell content with Astryx components like Badge, StatusDot, and Avatar via renderCell.',
      },
      {
        guidance: false,
        description:
          'Use a table for data without consistent columns. Use a list or card layout for heterogeneous content.',
      },
      {
        guidance: false,
        description:
          'Enable every plugin at once. Add only the features your use case requires to keep the interface focused.',
      },
    ],
    anatomy,
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Data-driven table w/ rich cell content via renderCell. Compose cells w/ Badge, StatusDot, Text, Avatar, layout primitives. BaseTable provides unstyled structural core w/ composable plugin pipeline.',
  usage: {
    description:
      'Table displays structured data in rows and columns with consistent dimensionality. It supports rich cell content, sorting, selection, pagination, and column management through a composable plugin system. Use Table for data sets with uniform structure; for simpler or inconsistent data, consider a list or card layout instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use density and divider variants to match the information density and scanning needs of your data.',
      },
      {
        guidance: true,
        description:
          'Compose rich cell content with Astryx components like Badge, StatusDot, and Avatar via renderCell.',
      },
      {
        guidance: true,
        description:
          'Children mode: wrap rows in TableHeader/TableBody/TableFooter. <table> cannot hold a <tr> directly; the parser adds an implied <tbody> for SSR markup, React does not on the client, so unwrapped rows mismatch on hydration.',
      },
      {
        guidance: true,
        description:
          'Omitted width = equal flex w/ compact 60px readability floor. Per-column floor: proportional(1, {minWidth}). Weighted: proportional(n). Fixed: pixel(). Table scrolls when combined floors do not fit.',
      },
      {
        guidance: true,
        description:
          'Data-driven API is RSC-safe: proportional(), pixel(), column defs w/o function props work in Server Components. renderCell (any function prop) requires a "use client" wrapper.',
      },
      {
        guidance: false,
        description:
          'Use a table for data without consistent columns. Use a list or card layout for heterogeneous content.',
      },
      {
        guidance: false,
        description:
          'Enable every plugin at once. Add only the features your use case requires to keep the interface focused.',
      },
      {
        guidance: false,
        description:
          'Rely on the 60px omitted-width floor for a text-heavy column that needs more room; set proportional(1, {minWidth}) on it instead.',
      },
    ],
    anatomy,
  },
};
