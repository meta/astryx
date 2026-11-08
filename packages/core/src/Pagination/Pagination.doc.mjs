// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Pagination',
    required: true,
    description:
      'Navigation landmark containing the current paging controls and optional page-size selector.',
  },
  {
    name: 'Page-size selector',
    required: false,
    description: 'Optional Selector for choosing how many items appear per page.',
  },
  {
    name: 'First/last buttons',
    required: false,
    description:
      'Optional Button controls that jump to the first or last known page.',
  },
  {
    name: 'Previous/next buttons',
    required: true,
    description:
      'Button controls that move backward or forward through the pages.',
  },
  {
    name: 'Page number button',
    required: false,
    description:
      'Button for one directly selectable page in the numbered presentation.',
  },
  {
    name: 'Ellipsis',
    required: false,
    description:
      'Visual omission marker between non-adjacent page-number buttons.',
  },
  {
    name: 'Count readout',
    required: false,
    description:
      'Text showing the current item range and total item count.',
  },
  {
    name: 'Compact readout',
    required: false,
    description: 'Text showing the current page and total page count.',
  },
  {
    name: 'Dot',
    required: false,
    description:
      'Page indicator control that reflects and changes the active page.',
  },
  {
    name: 'Page input label',
    required: false,
    description: 'Leading visible label for the editable page-number field.',
  },
  {
    name: 'Page input',
    required: false,
    description: 'NumberInput used to enter a page directly.',
  },
  {
    name: 'Page input total',
    required: false,
    description: 'Trailing text showing the known total page count.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Pagination',
  displayName: 'Pagination',
  category: 'Navigation',
  keywords: ["pagination","pager","paginator","pagenavigation","paging","paginate","pages","pagecontrol"],
  props: [
    {
      name: 'page',
      type: 'number',
      description: 'Current page number (1-based). Page 1 is the first page.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(page: number) => void',
      description: 'Called when the page changes.',
      required: true,
    },
    {
      name: 'changeAction',
      type: '(page: number) => void | Promise<void>',
      description:
        'Async action on page change. Fires after onChange and uses React transitions for built-in loading state.',
    },
    {
      name: 'totalItems',
      type: 'number',
      description:
        'Total number of items. Used to calculate page count. Takes precedence over totalPages if both provided.',
    },
    {
      name: 'totalPages',
      type: 'number',
      description:
        'Total number of pages. Use when you know page count but not item count.',
    },
    {
      name: 'hasMore',
      type: 'boolean',
      description:
        'Whether more pages exist after the current one. Use for cursor-based pagination where total is unknown.',
    },
    {
      name: 'pageSize',
      type: 'number',
      description: 'Number of items per page. Coerced to a positive integer; non-finite values fall back to the default.',
      default: '10',
    },
    {
      name: 'pageSizeOptions',
      type: 'number[]',
      description:
        'Available page size options. Shows a page size selector dropdown when provided.',
    },
    {
      name: 'onPageSizeChange',
      type: '(pageSize: number) => void',
      description:
        'Called when the page size changes. Automatically resets to page 1.',
    },
    {
      name: 'variant',
      type: "'pages' | 'count' | 'compact' | 'dots' | 'input' | 'none'",
      description:
        "Visual variant controlling what appears between prev/next buttons. 'pages' shows page number buttons with ellipsis, 'count' shows 'X-Y of Z' text, 'compact' shows 'Page X of Y' (add first/last buttons with hasFirstLast), 'dots' shows dot indicators, 'input' shows an editable page-number box with a leading label ('Page [ n ] / N') flanked by first/last buttons by default (the box needs a known total to clamp against, so it is disabled in cursor/hasMore mode), 'none' shows just prev/next buttons.",
      default: "'pages'",
    },
    {
      name: 'pageLabel',
      type: 'string',
      description:
        "The noun rendered before the editable box in the 'input' variant, e.g. 'Page' or 'Row'. Navigation is always page-based (via onChange); this only relabels the box. Defaults to the localized 'Page'.",
    },
    {
      name: 'hasFirstLast',
      type: 'boolean',
      description:
        "Whether to show first/last («/») double-chevron buttons flanking prev/next. Applies to the 'input' variant (shown unless false) and the 'compact' variant (shown only when true); other variants ignore it. Omitted when the page count is unknown (cursor/hasMore pagination).",
      default: "true for 'input'; false for 'compact'",
    },
    {
      name: 'step',
      type: 'number',
      description:
        'Number of pages the previous/next buttons advance per click. Clamped to the valid page range, so a step that would overshoot lands on the first/last page. When greater than 1, the buttons\' accessible names reflect the stride. Non-integer or values < 1 fall back to 1.',
      default: '1',
    },
    {
      name: 'siblingCount',
      type: 'number',
      description:
        "Number of page buttons to show on each side of the current page. Only applies when variant='pages'.",
      default: '1',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: 'Size of the pagination controls.',
      default: "'md'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the component is disabled.',
      default: 'false',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the navigation landmark.',
      default: "'Pagination'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-pagination', visualProps: ['size', 'variant']},
      {className: 'astryx-pagination-dot', visualProps: ['size'], states: ['active']},
      {className: 'astryx-pagination-input-label', visualProps: ['size']},
      {className: 'astryx-pagination-input-total', visualProps: ['size']},
    ],
  },
  playground: {
    defaults: {
      page: 1,
      totalItems: 100,
      pageSize: 10,
      variant: 'pages',
    },
  },
  usage: {
    anatomy,
    description:
      'Pagination lets users step through pages of content. Place it below a table, list, or card grid so users can move forward and backward through results. Pick a variant to match the context: numbered pages for data tables, a count for large lists, compact for tight spaces, or dots for carousels.',
    bestPractices: [
      { guidance: true, description: 'Place pagination below the content it controls so users see results before navigating.' },
      { guidance: true, description: 'Use the pages variant for data tables where users need to jump to a specific page.' },
      { guidance: true, description: 'Use the count variant with a page size selector when users need to control how many items they see at once.' },
      { guidance: true, description: 'Use the dots variant for carousels and walkthroughs where the total is small and position matters more than a number.' },
      { guidance: true, description: 'Pass totalItems when the total is known so users can see how much content remains.' },
      { guidance: false, description: 'Show pagination when all items fit on a single page; there is nothing to paginate.' },
      { guidance: false, description: 'Use the dots variant for more than about 10 pages; the dots become too small to be useful.' },
      { guidance: false, description: 'Place pagination above the content; users expect it at the bottom.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Pagination',
  displayName: 'Pagination',
  props: [
    {
      name: 'page',
      type: 'number',
      description: '当前页码（从 1 开始）。第 1 页为首页。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(page: number) => void',
      description: '页码变化时调用。',
      required: true,
    },
    {
      name: 'changeAction',
      type: '(page: number) => void | Promise<void>',
      description:
        '页码变化时的异步操作。在 onChange 之后触发，使用 React transitions 实现内置加载状态。',
    },
    {
      name: 'totalItems',
      type: 'number',
      description:
        '总项目数。用于计算页数。同时提供时优先于 totalPages。',
    },
    {
      name: 'totalPages',
      type: 'number',
      description:
        '总页数。当你知道页数但不知道项目数时使用。',
    },
    {
      name: 'hasMore',
      type: 'boolean',
      description:
        '当前页之后是否还有更多页。用于总数未知的游标分页。',
    },
    {
      name: 'pageSize',
      type: 'number',
      description: '每页项目数。强制转换为正整数；非有限值回退到默认值。',
      default: '10',
    },
    {
      name: 'pageSizeOptions',
      type: 'number[]',
      description:
        '可用的每页大小选项。提供时显示每页大小选择器下拉菜单。',
    },
    {
      name: 'onPageSizeChange',
      type: '(pageSize: number) => void',
      description:
        '每页大小变化时调用。自动重置到第 1 页。',
    },
    {
      name: 'variant',
      type: "'pages' | 'count' | 'compact' | 'dots' | 'input' | 'none'",
      description:
        "控制上一页/下一页按钮之间显示内容的视觉变体。'pages' 显示带省略号的页码按钮，'count' 显示 'X-Y of Z' 文本，'compact' 显示 'Page X of Y'（可通过 hasFirstLast 添加首页/末页按钮），'dots' 显示点指示器，'input' 显示带前置标签的可编辑页码框——'Page [ n ] / N'——默认两侧带首页/末页按钮，'none' 仅显示上一页/下一页按钮。",
      default: "'pages'",
    },
    {
      name: 'pageLabel',
      type: 'string',
      description:
        "'input' 变体中可编辑框前显示的名词，如 'Page' 或 'Row'。导航始终基于页码（通过 onChange）；此项仅用于重新标注。默认为本地化的 'Page'。",
    },
    {
      name: 'hasFirstLast',
      type: 'boolean',
      description:
        "是否显示首页/末页（«/»）双箭头按钮，位于上一页/下一页两侧。适用于 'input' 变体（除非设为 false 否则显示）和 'compact' 变体（仅在设为 true 时显示）；其他变体忽略此项。当页数未知（游标/hasMore 分页）时省略。",
      default: "'input' 为 true；'compact' 为 false",
    },
    {
      name: 'step',
      type: 'number',
      description:
        '上一页/下一页按钮每次点击前进的页数。会被限制在有效页码范围内，因此超出范围的步进会落在首页/末页。大于 1 时，按钮的无障碍名称会反映跨步页数。非整数或小于 1 的值回退为 1。',
      default: '1',
    },
    {
      name: 'siblingCount',
      type: 'number',
      description:
        "当前页两侧显示的页码按钮数量。仅在 variant='pages' 时生效。",
      default: '1',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: '分页控件的尺寸。',
      default: "'md'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '组件是否禁用。',
      default: 'false',
    },
    {
      name: 'label',
      type: 'string',
      description: '导航地标的无障碍标签。',
      default: "'Pagination'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义（外边距、定位、尺寸）的 StyleX 样式。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-pagination', visualProps: ['size', 'variant']},
      {className: 'astryx-pagination-dot', visualProps: ['size'], states: ['active']},
      {className: 'astryx-pagination-input-label', visualProps: ['size']},
      {className: 'astryx-pagination-input-total', visualProps: ['size']},
    ],
  },
  usage: {
    anatomy,
    description:
      'Pagination lets users step through pages of content. Place it below a table, list, or card grid so users can move forward and backward through results. Pick a variant to match the context: numbered pages for data tables, a count for large lists, compact for tight spaces, or dots for carousels.',
    bestPractices: [
      { guidance: true, description: 'Place pagination below the content it controls so users see results before navigating.' },
      { guidance: true, description: 'Use the pages variant for data tables where users need to jump to a specific page.' },
      { guidance: true, description: 'Use the count variant with a page size selector when users need to control how many items they see at once.' },
      { guidance: true, description: 'Use the dots variant for carousels and walkthroughs where the total is small and position matters more than a number.' },
      { guidance: true, description: 'Pass totalItems when the total is known so users can see how much content remains.' },
      { guidance: false, description: 'Show pagination when all items fit on a single page; there is nothing to paginate.' },
      { guidance: false, description: 'Use the dots variant for more than about 10 pages; the dots become too small to be useful.' },
      { guidance: false, description: 'Place pagination above the content; users expect it at the bottom.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Standalone pagination controls for navigating content pages. Supports multiple display variants + works w/ known totals or cursor-based pagination.',
  usage: {
    anatomy,
    description:
      'Pagination lets users step through pages of content. Place it below a table, list, or card grid so users can move forward and backward through results. Pick a variant to match the context: numbered pages for data tables, a count for large lists, compact for tight spaces, or dots for carousels.',
    bestPractices: [
      { guidance: true, description: 'Place pagination below the content it controls so users see results before navigating.' },
      { guidance: true, description: 'Use the pages variant for data tables where users need to jump to a specific page.' },
      { guidance: true, description: 'Use the count variant with a page size selector when users need to control how many items they see at once.' },
      { guidance: true, description: 'Use the dots variant for carousels and walkthroughs where the total is small and position matters more than a number.' },
      { guidance: true, description: 'Pass totalItems when the total is known so users can see how much content remains.' },
      { guidance: false, description: 'Show pagination when all items fit on a single page; there is nothing to paginate.' },
      { guidance: false, description: 'Use the dots variant for more than about 10 pages; the dots become too small to be useful.' },
      { guidance: false, description: 'Place pagination above the content; users expect it at the bottom.' },
    ],
  },
  propDescriptions: {
    page: 'Current page number (1-based).',
    onChange: 'Called on page change.',
    changeAction:
      'Async action on page change. Fires after onChange; uses React transitions for loading.',
    totalItems: 'Total items. Calculates page count. Precedence over totalPages.',
    totalPages: 'Total pages. Use when page count known but not item count.',
    hasMore: 'More pages exist after current. For cursor-based pagination.',
    pageSize: 'Items per page; coerced to positive integer, non-finite falls back to default',
    pageSizeOptions: 'Page size options. Shows selector dropdown when provided.',
    onPageSizeChange: 'Called on page size change. Auto resets to page 1.',
    variant: "Display between prev/next. 'input' = 'Page [n] / N' + first/last.",
    pageLabel: "Noun before the 'input' box (e.g. 'Page' or 'Row'). Navigation stays page-based. Default localized 'Page'.",
    hasFirstLast: "Show first/last («/») buttons. 'input' default true; 'compact' default false (opt in). Other variants ignore. Omitted when total unknown.",
    step: 'Pages the prev/next buttons advance per click. Clamped to range; < 1 or non-integer falls back to 1.',
    siblingCount: "Page buttons each side of current; only variant='pages'.",
    size: 'Control size.',
    isDisabled: 'Component disabled.',
    label: 'Accessible label for nav landmark.',
    xstyle:
      'StyleX styles for layout customization (margins, positioning, sizing). Must be stylex.create() value.',
  },
};
