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
      'Outer region that scrolls horizontally when columns overflow. Fixed-height virtualization also enables block scrolling; the region enters keyboard order while either applicable axis overflows.',
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
      {
        className: 'astryx-table-row',
        states: ['selected', 'striped'],
        visualProps: ['parity'],
      },
      {className: 'astryx-table-cell', visualProps: ['density']},
      {className: 'astryx-table-header-cell', visualProps: ['density']},
    ],
    vars: [
      {
        name: '--table-row-overlay',
        description:
          "The row's current fill (its stripe, hover or selection wash), which a pinned column's cells replay over their opaque base. A theme's background on `table-row` sets it too, so a themed stripe or hover reaches pinned columns.",
        default: 'unset (a pinned cell shows its base)',
        private: true,
      },
    ],
    derived: [{property: 'backgroundColor', vars: ['--table-row-overlay']}],
    componentIcons: [
      {
        slot: 'table-sort-indicator',
        description:
          "The sort direction glyph beside a sortable column's label (`useTableSortable`).",
        fallback:
          '`arrowUp` ascending; `arrowDown` descending; `arrowsUpDown` unsorted',
        state: [
          {
            name: 'direction',
            type: "'ascending' | 'descending' | 'none'",
            description:
              "The column's sort direction; `none` while the column is not sorted.",
          },
        ],
        whenNull:
          'Hides the glyph. The Sort control keeps its label and its click and keyboard sorting; the column header keeps `aria-sort`.',
      },
      {
        slot: 'table-row-expand',
        description:
          "The glyph in a row's expansion toggle (`useTableRowExpansion`). The toggle turns the glyph a quarter turn while the row is expanded and mirrors it in right-to-left layouts, so map a glyph that points toward the inline end.",
        fallback: '`chevronRight`, turned while expanded',
        state: [
          {
            name: 'expanded',
            type: 'boolean',
            description: "True while the row's detail panel is open.",
          },
        ],
        whenNull:
          'Hides the glyph. The toggle keeps its size, its "Expand row" or "Collapse row" name, `aria-expanded`, and its click and keyboard toggling.',
      },
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
        'Canonical row identity: a property name projects valid strings and finite numbers to strings; a function retains string/number type. Optional legacy tables fall back to index. Virtualization requires explicit unique valid keys.',
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
      description:
        "Stripes alternate rows (every other row, zebra striping): a background wash on the even-numbered body and footer rows. A theme restyles either stripe of a data-driven table through the `table-row` target's `parity` (odd or even); every row a striped table may stripe (body and footer rows, not the header row) carries the `striped` state. A pinned column (`useTableStickyColumns`) follows the row's stripe.",
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
      name: 'virtualization',
      type: 'TableVirtualizationCapability | TableVirtualizationCapability[]',
      description:
        "Geometry-only capability from useTableRowsVirtualization or useTableColumnsVirtualization, or a list with at most one of each; any other list renders without windowing. useTableColumnsVirtualization({initialViewportWidth}) mounts only the unpinned columns near the viewport. useTableRowsVirtualization({rowHeight, initialViewportHeight}) takes sizes that are both positive finite CSS pixels; the Table scrolls inside the height its parent gives it, and initialViewportHeight only sizes the first window. Give the Table's parent a height, fixed or relative, or a flex child, so windowing can bound the rows; with no height every row renders. Pass complete flat data and an explicit idKey. Default text truncates; custom renderers, wrapping, structural plugins, incompatible offsets, invalid identity or unrepresentable geometry use full rendering. Logical row positions include the header.",
    },
    {
      name: 'plugins',
      type: 'Record<string, TablePlugin<T>>',
      description:
        "Named plugins: the objects that the useTable* hooks return, or your own TablePlugin<T> (import the type from @astryxdesign/core/Table), an object of optional transform functions. When the table renders, Table calls transformColumns, transformTable, transformHeaderCell for each header cell, transformHeaderRow, transformScrollWrapper, and then transformTableContext in reverse plugin order, so the first plugin wraps outermost. With column virtualization, transformHeaderCell and transformHeaderRow run after transformScrollWrapper and transformTableContext, because the header renders inside the column window. Then, as each body row renders, Table calls transformBodyRow for that row and then transformBodyCell for each of its cells. Their arguments and results: transformColumns(columns) adds, removes, or reorders columns; transformTable(props) changes the <table> props; transformHeaderCell(props, column, columnIndex, columns) changes a <th>, with slots before, content, after, overlay, and below; transformHeaderRow(props) changes the header <tr>; transformBodyCell(props, column, item, columnIndex, columns, context) changes a <td>; transformBodyRow(props, item, index, context) changes a body <tr>, and can add afterRow content below the row; transformScrollWrapper(props, context) changes the scroll region and can add beforeTable or afterTable content; transformTableContext(children) wraps the table in providers. The element transforms (table, header row, header cell, body row, body cell, scroll wrapper) receive {htmlProps, xstyle, ...} and must return the same shape, with the earlier values kept. Header and body cell transforms can also append contextMenuActions for a right-click menu. A plugin that has transformBodyRow or transformBodyCell and keeps one row per data item must set rowModel: 'flat'; without it, row virtualization uses full rendering and Table ignores plugin loading state (renderState). Keep each plugin object stable (create it in useMemo): a new object on each render renders all rows again. Plugins with the first-party names columnSettings, sort, tree, selection, and pagination run in that order; other names run after them, in record order.",
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
      name: 'emptyState',
      type: 'ReactNode | false',
      description:
        'Content that shows when data is an empty array, for example an EmptyState that says no rows match the filters. It renders in one row across all columns. Omit it for a compact "No data" EmptyState. Pass false for an empty body. Table does not know why data is empty: choose the content from your own state, for example "No results" when filters are active and "No users yet" when they are not.',
      default: '<EmptyState title="No data" isCompact />',
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
        guidance: true,
        description:
          "To open a row (go to a detail page, open a side panel), put a Link or a Button in the row's main cell with renderCell. Table has no row-click prop. A click handler on the <tr> cannot be reached with the keyboard or a screen reader, so do not use it as the only way to open a row. A renderCell column makes a windowed Table (virtualization) render every row.",
      },
      {
        guidance: true,
        description:
          'When filters or a search can leave no rows, set emptyState to say so and offer a way out, for example an EmptyState with a "Clear filters" Button.',
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
  examples: [
    {
      label: 'Open a row from a link in its main cell',
      code: `const columns = [
  {
    key: 'name',
    header: 'Name',
    // A real link: keyboard, screen reader, and open-in-new-tab all work.
    renderCell: user => <Link href={\`/users/\${user.id}\`}>{user.name}</Link>,
  },
  {key: 'role', header: 'Role'},
];

<Table data={users} columns={columns} idKey="id" hasHover />;`,
    },
    {
      label: 'Open a row in a side panel',
      code: `const [openId, setOpenId] = useState(null);

const columns = [
  {
    key: 'name',
    header: 'Name',
    renderCell: user => (
      <Button label={user.name} variant="ghost" onClick={() => setOpenId(user.id)} />
    ),
  },
  {key: 'role', header: 'Role'},
];

<Table
  data={users}
  columns={columns}
  idKey="id"
/>;`,
    },
  ],
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
        guidance: true,
        description:
          '要打开某一行（进入详情页或打开侧边面板），用 renderCell 在该行的主单元格中放一个 Link 或 Button。Table 没有行点击属性。<tr> 上的点击处理程序无法通过键盘或屏幕阅读器访问，所以不要把它作为打开行的唯一方式。renderCell 列会让开启虚拟化的 Table 渲染所有行。',
      },
      {
        guidance: true,
        description:
          '当筛选或搜索可能导致没有行时，设置 emptyState 说明情况并提供出路，例如带“清除筛选”Button 的 EmptyState。',
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
        guidance: true,
        description:
          'Row open/click: no row-click prop. Put a Link or Button in the main cell via renderCell. <tr> onClick alone is not keyboard or screen-reader reachable. renderCell turns windowing off (full render).',
      },
      {
        guidance: true,
        description:
          'Filtered/searched data can be empty: set emptyState (e.g. EmptyState + "Clear filters" Button).',
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
