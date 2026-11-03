// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'PowerSearch',
  displayName: 'Power Search',
  category: 'Form Controls',
  keywords: [
    'powersearch',
    'search',
    'searchbar',
    'filter',
    'filterbar',
    'faceted',
    'querybuilder',
    'structured',
    'omnibar',
  ],
  props: [
    {
      name: 'config',
      type: 'PowerSearchConfig',
      description:
        'Configuration defining available fields, operators, and their value types.',
      required: true,
    },
    {
      name: 'filters',
      type: 'ReadonlyArray<PowerSearchFilter>',
      description: 'Currently active filters.',
      required: true,
    },
    {
      name: 'onChange',
      type: "(filters: ReadonlyArray<PowerSearchFilter>, changeType: 'add' | 'edit' | 'remove', index: number) => void",
      description:
        "Called when filters change. changeType is 'add', 'edit', or 'remove'. index is the affected filter's position.",
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the search input.',
      default: "'Search'",
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Visually hides the label while keeping it accessible.',
      default: 'true',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text shown when no filters are selected.',
      default: "'Search...'",
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: 'Auto-focus the input on mount.',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Show a clear-all button that removes every editable filter. Read-only filters stay.',
      default: 'true',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description: 'Prevent adding, editing, or removing filters.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disables the entire component.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the search is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (input stays blocked). Use this instead of wrapping a disabled PowerSearch in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: 'Validation status object with type and optional message.',
    },
    {
      name: 'startIcon',
      type: 'ReactNode | IconType',
      description:
        'Icon to display at the start of the input, before any filter tokens. Forwarded to the internal Tokenizer. Accepts a semantic icon name, an SVG icon component, or a ReactNode directly.',
      slotElements: [{__element: 'Icon', props: {icon: 'search', size: 'sm'}}],
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing.',
      default: "'attached'",
    },
    {
      name: 'maxTokenLength',
      type: 'number',
      description: 'Max character length for filter value display in tokens.',
      default: '40',
    },
    {
      name: 'maxOperatorMenuItems',
      type: 'number',
      description:
        'Maximum suggestions shown in string and entity value typeaheads. Does not affect the main field search menu or enum value menus.',
      default: '10',
    },
    {
      name: 'maxSearchResults',
      type: 'number',
      description:
        'Max ranked results for a non-empty query. Does not affect a field value editor. Browsing with an empty query shows up to 1,000 fields.',
      default: '10',
    },
    {
      name: 'menuWidth',
      type: 'number',
      description:
        'Width in pixels for the main field/search menu. Does not affect field value editors.',
    },
    {
      name: 'popoverSaveButtonLabel',
      type: 'string',
      description: 'Label for the save button in the edit popover.',
      default: "'Apply'",
    },
    {
      name: 'timezoneID',
      type: 'string',
      description: 'Timezone ID for date formatting (e.g. "America/New_York").',
    },
    {
      name: 'handleRef',
      type: 'Ref<PowerSearchHandle>',
      description:
        'Imperative handle with focusTypeahead() and blurTypeahead() methods.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content to display at the end of the input row. Useful for action buttons or other controls.',
      slotElements: [
        {__element: 'Icon', props: {icon: 'chevronDown', size: 'sm'}},
        {__element: 'Badge', props: {label: '3'}},
      ],
    },
    {
      name: 'resultCount',
      type: 'number | string',
      description:
        'Number of results matching the current filters. When a number, formatted as "N results". When a string, displayed as-is. Changes are announced to screen readers via a polite live region.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size of the search input and tokens.',
      default: "'md'",
    },
    {
      name: 'menuWidth',
      type: 'number',
      description:
        'Maximum width for the operator/value dropdown menu in pixels.',
    },
    {
      name: 'maxOperatorMenuItems',
      type: 'number',
      description:
        'Maximum number of items displayed in the operator dropdown.',
    },
    {
      name: 'tokenOverflowBehavior',
      type: "'none' | 'unfocusedInline' | 'unfocusedLayer'",
      description:
        'Controls how tokens overflow when the container is too narrow. Forwarded to Tokenizer.',
      default: "'none'",
    },
    {
      name: 'onFocus',
      type: '(e: React.FocusEvent) => void',
      description: 'Fires when focus enters the search input.',
    },
    {
      name: 'onBlur',
      type: '(e: React.FocusEvent) => void',
      description: 'Fires when focus leaves the search input.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization. Must be a stylex.create() value.',
    },
    {
      name: 'experimental',
      type: "{presentation?: 'popover' | 'bottom-sheet' | 'adaptive'}",
      stability: 'experimental',
      description:
        "Experimental options: anything in this object may change or be removed in a patch release, and omitting it keeps the stable behavior. presentation (default 'popover') chooses how the field presents filter editing. popover is the tokenizer field with its typeahead and the editor popover. bottom-sheet makes the whole field one trigger showing display-only filter tokens: it opens a Filters sheet listing the filters as rows that edit or remove a filter, with Add filter, Done, and Clear all (which asks first and keeps read-only filters); an Add filter sheet with the fields (or the content search with inline suggestions) opens above it, and a value step that stages operator → value and confirms from its footer opens above that. Dismissing a step reveals the one beneath. List values edit through the Tokenizer's own sheet. adaptive uses the bottom sheet on compact touch screens and the popover otherwise, resolved the same way Selector resolves it. In the sheet presentation menuWidth and tokenOverflowBehavior have no surface to act on and warn in development.",
    },
  ],
  examples: [
    {
      label: 'Touch sheet on compact screens (experimental)',
      code: `const [filters, setFilters] = useState([]);
<PowerSearch
  config={config}
  filters={filters}
  onChange={next => setFilters(next)}
  experimental={{presentation: 'adaptive'}}
/>`,
    },
  ],
  // `config` and `filters` are custom values the docsite preview cannot
  // generate automatically. Keep this small, but include an initial token so
  // the Properties tab demonstrates a realistic controlled PowerSearch.
  playground: {
    defaults: {
      config: {
        name: 'IssueSearch',
        fields: [
          {
            key: 'status',
            label: 'Status',
            defaultOperator: 'is',
            operators: [
              {
                key: 'is',
                label: 'is',
                value: {
                  type: 'enum',
                  values: [
                    {value: 'open', label: 'Open'},
                    {value: 'closed', label: 'Closed'},
                  ],
                },
              },
            ],
          },
          {
            key: 'title',
            label: 'Title',
            defaultOperator: 'contains',
            operators: [
              {key: 'contains', label: 'contains', value: {type: 'string'}},
            ],
          },
        ],
      },
      filters: [
        {
          field: 'status',
          operator: 'is',
          value: {type: 'enum', value: 'open'},
        },
      ],
    },
  },
  usage: {
    description:
      'PowerSearch is a structured filter bar where each token represents a field, operator, and value. Use it for complex multi-dimensional filtering when users need to combine multiple search criteria. For simple single-field search, use a text input instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Define clear, descriptive field names and aliases so users can quickly find the filter they need.',
      },
      {
        guidance: true,
        description:
          'Provide a result count to give users feedback on how their filters affect the data set.',
      },
      {
        guidance: false,
        description:
          'Use PowerSearch for simple keyword searches; a standard text input is more appropriate for single-field lookups.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled PowerSearch in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
  theming: {
    targets: [{className: 'astryx-power-search'}],
    vars: [
      {
        name: '--_power-search-sheet-hit-inset',
        description:
          "Outset of the invisible hit area of the touch sheet's icon-sized actions (the Filters header's Add filter and each row's remove button), applied to a ::after overlay. 0 on a fine pointer; negative on a coarse one, which grows the action to a 44px touch target without changing what is drawn.",
        default: '0px',
        private: true,
      },
      {
        name: '--_power-search-sheet-hit-content',
        description:
          'Whether the touch sheet\'s invisible hit overlay exists. `none` on a fine pointer, so no ::after is generated and hover still reaches the action; `""` on a coarse one, where the overlay provides the 44px touch target.',
        default: 'none',
        private: true,
      },
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
  name: 'PowerSearch',
  displayName: 'Power Search',
  props: [
    {
      name: 'config',
      type: 'PowerSearchConfig',
      description: '定义可用字段、运算符及其值类型的配置。',
      required: true,
    },
    {
      name: 'filters',
      type: 'ReadonlyArray<PowerSearchFilter>',
      description: '当前活跃的过滤器。',
      required: true,
    },
    {
      name: 'onChange',
      type: "(filters: ReadonlyArray<PowerSearchFilter>, changeType: 'add' | 'edit' | 'remove', index: number) => void",
      description:
        "当过滤器变更时调用。changeType 为 'add'、'edit' 或 'remove'。index 为受影响的过滤器位置。",
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: '搜索输入框的无障碍标签。',
      default: "'Search'",
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '视觉上隐藏标签，同时保持无障碍性。',
      default: 'true',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '未选择过滤器时显示的占位文本。',
      default: "'Search...'",
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: '挂载时自动聚焦输入框。',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: '显示清除全部按钮，移除可编辑的过滤器，保留只读过滤器。',
      default: 'true',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description: '阻止添加、编辑或移除过滤器。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '禁用整个组件。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the search is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (input stays blocked). Use this instead of wrapping a disabled PowerSearch in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: '带有类型和可选消息的验证状态对象。',
    },
    {
      name: 'startIcon',
      type: 'ReactNode | IconType',
      description:
        '在输入框开头（筛选 token 之前）显示的图标，转发给内部的 Tokenizer。接受语义图标名称、SVG 图标组件或直接传入 ReactNode。',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached'",
      description:
        '状态消息相对于输入框的放置方式。attached 直接叠加在输入框下方（带边框处理）；detached 作为独立元素浮于下方并留有间距。',
      default: "'attached'",
    },
    {
      name: 'maxTokenLength',
      type: 'number',
      description: '令牌中过滤器值显示的最大字符长度。',
      default: '40',
    },
    {
      name: 'maxOperatorMenuItems',
      type: 'number',
      description:
        '字符串和实体值预输入菜单中显示的最大建议数。不影响主字段搜索菜单或枚举值菜单。',
      default: '10',
    },
    {
      name: 'maxSearchResults',
      type: 'number',
      description:
        '非空查询的最大排名结果数。不影响字段值编辑器。使用空查询浏览时最多显示 1,000 个字段。',
      default: '10',
    },
    {
      name: 'menuWidth',
      type: 'number',
      description: '主字段/搜索菜单的像素宽度。不影响字段值编辑器。',
    },
    {
      name: 'popoverSaveButtonLabel',
      type: 'string',
      description: '编辑弹出窗口中保存按钮的标签。',
      default: "'Apply'",
    },
    {
      name: 'timezoneID',
      type: 'string',
      description: '用于日期格式化的时区 ID（例如 "America/New_York"）。',
    },
    {
      name: 'handleRef',
      type: 'Ref<PowerSearchHandle>',
      description:
        '提供 focusTypeahead() 和 blurTypeahead() 方法的命令式句柄。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: '显示在输入行末尾的内容。适用于操作按钮或其他控件。',
    },
    {
      name: 'resultCount',
      type: 'number | string',
      description:
        '匹配当前过滤器的结果数量。数字类型时格式化为"N results"。字符串类型时按原样显示。数量变化会通过 polite 实时区域向屏幕阅读器播报。',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '搜索输入框和标记的尺寸。',
      default: "'md'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '用于布局自定义的 StyleX 样式。必须是 stylex.create() 值。',
    },
    {
      name: 'experimental',
      type: "{presentation?: 'popover' | 'bottom-sheet' | 'adaptive'}",
      stability: 'experimental',
      description:
        "实验性选项：此对象中的任何内容都可能在补丁版本中更改或移除；省略它即保持稳定行为。presentation（默认 'popover'）决定字段如何呈现筛选编辑：popover 为带有预输入和编辑弹出层的标记字段；bottom-sheet 将整个字段变为一个显示只读筛选标记的触发按钮——点按后打开列出筛选项的「筛选」面板，每行可编辑或移除筛选（含添加筛选、完成、全部清除；全部清除会先确认，并保留只读筛选）；列出字段（或带内联建议的内容搜索）的「添加筛选」面板在其上方打开，按运算符 → 值暂存并在底部确认的取值步骤再在其上方打开。关闭某一步会露出下方的那一步。列表值通过 Tokenizer 自身的面板编辑。adaptive 在紧凑触摸屏上使用底部面板，其他情况使用 popover，解析方式与 Selector 相同。在底部面板呈现中，menuWidth 和 tokenOverflowBehavior 没有作用对象，并会在开发环境中发出警告。",
    },
  ],
  usage: {
    description:
      'PowerSearch is a structured filter bar where each token represents a field, operator, and value. Use it for complex multi-dimensional filtering when users need to combine multiple search criteria. For simple single-field search, use a text input instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Define clear, descriptive field names and aliases so users can quickly find the filter they need.',
      },
      {
        guidance: true,
        description:
          'Provide a result count to give users feedback on how their filters affect the data set.',
      },
      {
        guidance: false,
        description:
          'Use PowerSearch for simple keyword searches; a standard text input is more appropriate for single-field lookups.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled PowerSearch in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Structured filter bar where each token represents filter (field+operator+value). Users select fields from typeahead dropdown, configure operators+values in edit popover, manage filters as removable tokens.',
  usage: {
    description:
      'PowerSearch is a structured filter bar where each token represents a field, operator, and value. Use it for complex multi-dimensional filtering when users need to combine multiple search criteria. For simple single-field search, use a text input instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Define clear, descriptive field names and aliases so users can quickly find the filter they need.',
      },
      {
        guidance: true,
        description:
          'Provide a result count to give users feedback on how their filters affect the data set.',
      },
      {
        guidance: false,
        description:
          'Use PowerSearch for simple keyword searches; a standard text input is more appropriate for single-field lookups.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled PowerSearch in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
  propDescriptions: {
    config: 'Configuration defining available fields, operators, value types.',
    filters: 'Currently active filters.',
    onChange:
      "Called on filter change. changeType is 'add', 'edit', or 'remove'. index is affected filter position.",
    label: 'Accessible label for search input.',
    isLabelHidden: 'Visually hides label while keeping accessible.',
    placeholder: 'Text shown when no filters selected.',
    hasAutoFocus: 'Auto-focus input on mount.',
    hasClear:
      'Show clear-all button; removes editable filters, keeps read-only ones.',
    isReadOnly: 'Prevent adding, editing, or removing filters.',
    isDisabled: 'Disables entire component.',
    status: 'Validation status object w/ type + optional message.',
    startIcon:
      'Icon at input start, before filter tokens. Forwarded to internal Tokenizer.',
    statusVariant:
      'How status message is placed: attached overlaps below input; detached floats below w/ spacing.',
    maxTokenLength: 'Max char length for filter value display in tokens.',
    maxOperatorMenuItems:
      'Max suggestions in string/entity value typeaheads; excludes main field search + enum menus.',
    maxSearchResults:
      'Max ranked results for a non-empty query; excludes value editors.',
    menuWidth: 'Main field/search menu width in pixels.',
    popoverSaveButtonLabel: 'Label for save button in edit popover.',
    timezoneID: 'Timezone ID for date formatting (e.g. "America/New_York").',
    handleRef:
      'Imperative handle w/ focusTypeahead() + blurTypeahead() methods.',
    endContent:
      'Content at end of input row. Useful for action buttons or controls.',
    resultCount:
      'Result count matching current filters. Number formatted as "N results"; string displayed as-is.',
    size: 'Search input+token size.',
    xstyle:
      'StyleX styles for layout customization. Must be stylex.create() value.',
    experimental:
      "Experimental; may change in a patch. presentation: 'popover' (default, tokenizer field + editor popover) | 'bottom-sheet' (one trigger with display-only tokens + stacked Filters / Add filter / value sheets; rows remove inline; Clear all confirms, keeps read-only; list values via Tokenizer's sheet) | 'adaptive' (sheet on compact touch, else popover).",
  },
};
