// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Tree list',
    required: true,
    description: 'Container that presents the hierarchical tree.',
  },
  {
    name: 'Header',
    required: false,
    description: 'Caller-provided content that visibly names the tree.',
  },
  {
    name: 'Item',
    required: true,
    description: 'Painted row for one node in the hierarchy.',
  },
  {
    name: 'Chevron',
    required: false,
    description:
      'Expand and collapse control rendered for an Item with children.',
  },
  {
    name: 'Chevron glyph',
    required: false,
    description: 'Directional symbol rendered by Icon inside a Chevron.',
  },
  {
    name: 'Item label',
    required: true,
    description: 'Primary content that identifies an Item.',
  },
  {
    name: 'Item description',
    required: false,
    description: 'Secondary text rendered below an Item label.',
  },
  {
    name: 'Start content',
    required: false,
    description: 'Caller-provided content rendered before an Item label.',
  },
  {
    name: 'End content',
    required: false,
    description: 'Caller-provided content rendered after an Item label.',
  },
  {
    name: 'Guide',
    required: false,
    description: 'Connector line that shows parent-child relationships.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TreeList',
  displayName: 'Tree List',
  group: 'TreeList',
  category: 'Table & List',
  keywords: ['tree', 'hierarchy', 'nested', 'accordion', 'folder', 'expand', 'collapse', 'treeview', 'outline'],
  playground: {
    defaults: {
      items: [
        {id: '1', label: 'Documents', children: [
          {id: '1a', label: 'Report.pdf'},
          {id: '1b', label: 'Notes.md'},
        ]},
        {id: '2', label: 'Images', children: [
          {id: '2a', label: 'Photo.jpg'},
        ]},
        {id: '3', label: 'README.md'},
      ],
    },
  },
  theming: {
    targets: [
      {className: 'astryx-tree-list', visualProps: ['density', 'variant']},
      {className: 'astryx-tree-list-item', visualProps: ['density'], states: ['selected', 'disabled']},
      {className: 'astryx-tree-list-chevron', states: ['state']},
      {className: 'astryx-tree-list-item-label', states: ['selected']},
      {className: 'astryx-tree-list-guide'},
    ],
    vars: [
      {name: '--tree-list-indent', description: 'Per-level indentation step. Each nesting level indents its rows by this distance, and the guide lines follow it so they stay aligned. Set it on the `tree-list` target to retune the metric (e.g. `var(--spacing-5)` for a wider indent).', default: 'var(--spacing-4)'},
      {name: '--tree-list-row-gap', description: 'Vertical gap between adjacent rows. Default `2px` (var(--spacing-0-5)) gives a subtle separation; set it on the `tree-list` target to widen or close the gap. The connector guides span the gap automatically (the line stays continuous) and do not overhang the last row, so no guide-height tuning is needed.', default: 'var(--spacing-0-5)'},
      {name: '--_tree-indent', description: 'Distance one row is indented, computed per row from --tree-list-indent and the row depth. Set --tree-list-indent to retune indentation; this is the resolved value.', default: '0px', private: true},
      {name: '--_tree-focus-z', description: 'Stacking order of a row while its treeitem has keyboard focus, published by each treeitem so its focused row paints above the guide lines. Not a theming lever.', default: 'auto', private: true},
    ],
  },
  components: [
    {
      name: 'TreeList',
      displayName: 'Tree List',
      description:
        'Tree list container. Accepts items data and rendering configuration. Expansion state is managed internally.',      props: [
        {
          name: 'items',
          type: 'TreeListItemData[]',
          description:
            'Recursive tree item data with id, label, optional children and isExpanded, plus optional xstyle, className, and style applied to that item row.',
          required: true,
        },
        {
          name: 'density',
          type: "'compact' | 'balanced' | 'spacious'",
          description: 'Spacing density for items.',
          default: "'balanced'",
        },
        {
          name: 'variant',
          type: "'lineGuides' | 'noGuides'",
          description:
            'Visual treatment of the hierarchy guide lines. lineGuides shows connector lines; noGuides hides them, keeping indentation. Orthogonal to density.',
          default: "'lineGuides'",
        },
        {
          name: 'animatedLayout',
          type: 'AnimatedLayout',
          description:
            'The handle from useAnimatedLayout({containerRef}). With it, expanding or collapsing a row glides the rows and content after it, up to that container, on one shared motion role instead of jumping, and the shown rows and the chevron move on the same motion. Without it, the content after the row takes its place at once.',
        },
        {
          name: 'header',
          type: 'ReactNode',
          description:
            'Header content, associated with the tree via aria-labelledby.',
          slotElements: [{__element: 'Text', props: {type: 'body'}, children: 'Header'}],
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization. Must be a stylex.create() value.',
        },
      ],
    },
  ],
  usage: {
    anatomy,
    description:
      'An expandable tree structure for displaying hierarchical data with branch connector lines. Use it for file explorers, nested category browsers, or any interface that visualizes parent-child relationships.',
    bestPractices: [
      {guidance: true, description: 'Provide meaningful labels and icons for each node to make the hierarchy easy to scan.'},
      {guidance: true, description: 'Pre-expand important branches so users see key content immediately.'},
      {guidance: true, description: 'Leaf rows reserve space for a chevron column whenever the tree has any expandable item to line up under; only a fully flat tree (no expandable items at all) renders its rows flush. Rely on this rather than nudging indentation with custom CSS.'},
      {guidance: false, description: 'Nest more than 4–5 levels deep; flatten the structure or use a different pattern.'},
      {guidance: false, description: 'Use a tree for flat, non-hierarchical data; use a List instead.'},
    ],
  },
};

// -------------------------------------------------------
// Auto-generated translations below. Do not edit manually.
// Regenerate with the dense compression protocol.
// See .context/decisions/dense-compression-protocol.md
// -------------------------------------------------------

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'TreeList',
  displayName: 'Tree List',
  group: 'TreeList',
  theming: {
    targets: [
      {className: 'astryx-tree-list', visualProps: ['density', 'variant']},
      {className: 'astryx-tree-list-item', visualProps: ['density'], states: ['selected', 'disabled']},
      {className: 'astryx-tree-list-chevron', states: ['state']},
      {className: 'astryx-tree-list-item-label', states: ['selected']},
      {className: 'astryx-tree-list-guide'},
    ],
    vars: [
      {name: '--tree-list-indent', description: '每级缩进步长。每个嵌套层级的行按此距离缩进，引导线随之对齐。在 `tree-list` 目标上设置以调整该度量（例如用 `var(--spacing-5)` 获得更宽的缩进）。', default: 'var(--spacing-4)'},
      {name: '--tree-list-row-gap', description: '相邻行之间的垂直间距。默认 `2px`（var(--spacing-0-5)）提供细微的分隔；在 `tree-list` 目标上设置以加宽或关闭间距。连接引导线会自动跨越该间距（线保持连续）且不会超出最后一行，因此无需调整引导线高度。', default: 'var(--spacing-0-5)'},
    ],
  },
  components: [
    {
      name: 'TreeList',
      displayName: 'Tree List',
      description:
        '树列表容器。接受 items 数据和渲染配置。展开状态在内部管理。',
      props: [
        {
          name: 'items',
          type: 'TreeListItemData[]',
          description:
            '递归树项数据。每项有 id、label、可选 children 数组和可选 isExpanded 布尔值用于设置初始状态。',
          required: true,
        },
        {
          name: 'density',
          type: "'compact' | 'balanced' | 'spacious'",
          description: '项目的间距密度。',
          default: "'balanced'",
        },
        {
          name: 'variant',
          type: "'lineGuides' | 'noGuides'",
          description:
            '层级引导线的视觉呈现。lineGuides 显示连接线；noGuides 隐藏连接线并保留缩进。与 density 正交。',
          default: "'lineGuides'",
        },
        {
          name: 'animatedLayout',
          type: 'AnimatedLayout',
          description:
            'useAnimatedLayout({containerRef}) 返回的句柄。传入后，展开或收起一行时，该行之后直到该容器内的行和内容会以同一个共享动效角色平滑移动，而不是跳动；新显示的行和箭头也使用同一动效。不传时，该行之后的内容会立即就位。',
        },
        {
          name: 'header',
          type: 'ReactNode',
          description:
            '标题内容，通过 aria-labelledby 与树关联。',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            '用于布局自定义的 StyleX 样式。必须是 stylex.create() 值。',
        },
      ],
    },
  ],
  usage: {
    anatomy,
    description:
      'An expandable tree structure for displaying hierarchical data with branch connector lines. Use it for file explorers, nested category browsers, or any interface that visualizes parent-child relationships.',
    bestPractices: [
      {guidance: true, description: 'Provide meaningful labels and icons for each node to make the hierarchy easy to scan.'},
      {guidance: true, description: 'Pre-expand important branches so users see key content immediately.'},
      {guidance: true, description: 'Leaf rows reserve space for a chevron column whenever the tree has any expandable item to line up under; only a fully flat tree (no expandable items at all) renders its rows flush. Rely on this rather than nudging indentation with custom CSS.'},
      {guidance: false, description: 'Nest more than 4–5 levels deep; flatten the structure or use a different pattern.'},
      {guidance: false, description: 'Use a tree for flat, non-hierarchical data; use a List instead.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Data-driven tree list for hierarchical data w/ expand/collapse, branch lines, interactive items. Flat items array w/ recursive children, no composition, no cloneElement.',
  usage: {
    anatomy,
    description:
      'An expandable tree structure for displaying hierarchical data with branch connector lines. Use it for file explorers, nested category browsers, or any interface that visualizes parent-child relationships.',
    bestPractices: [
      {guidance: true, description: 'Provide meaningful labels and icons for each node to make the hierarchy easy to scan.'},
      {guidance: true, description: 'Pre-expand important branches so users see key content immediately.'},
      {guidance: true, description: 'Leaf rows reserve space for a chevron column whenever the tree has any expandable item to line up under; only a fully flat tree (no expandable items at all) renders its rows flush. Rely on this rather than nudging indentation with custom CSS.'},
      {guidance: false, description: 'Nest more than 4–5 levels deep; flatten the structure or use a different pattern.'},
      {guidance: false, description: 'Use a tree for flat, non-hierarchical data; use a List instead.'},
    ],
  },
  propDescriptions: {
    items: 'Recursive tree item data w/ id, label, optional children + isExpanded, plus optional xstyle/className/style on its row.',
    density: 'Spacing density for items.',
    variant: 'Guide-line treatment: lineGuides shows connectors, noGuides hides them (indent kept). Orthogonal to density.',
    animatedLayout: 'handle from useAnimatedLayout({containerRef}); expand/collapse glides the content after the row inside that container on one shared motion role. Omit: content after the row snaps.',
    header: 'Header content, linked to tree via aria-labelledby.',
    xstyle: 'StyleX styles for layout. Must be stylex.create() value.',
  },
  components: [
    {
      name: 'TreeList',
      displayName: 'Tree List',
      description: 'Tree list container. Accepts items data + rendering config. Expansion managed internally.',
      propDescriptions: {
        items: 'Recursive tree item data w/ id, label, optional children + isExpanded, plus optional xstyle/className/style on its row.',
        density: 'Spacing density for items.',
        variant: 'Guide-line treatment: lineGuides shows connectors, noGuides hides them (indent kept). Orthogonal to density.',
        header: 'Header content, linked to tree via aria-labelledby.',
        xstyle: 'StyleX styles for layout. Must be stylex.create() value.',
      },
    },
  ],
};
