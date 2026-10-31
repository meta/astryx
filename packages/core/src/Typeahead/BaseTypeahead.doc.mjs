// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Input',
    required: true,
    description:
      'Bare combobox input. The caller supplies its visible field chrome and accessible name.',
  },
  {
    name: 'Loading status',
    required: false,
    description:
      'Named Spinner shown beside the input while an asynchronous source is pending, unless a composed owner takes over the busy indicator lane.',
  },
  {
    name: 'Dropdown',
    required: false,
    description:
      'Anchored listbox surface containing current search or bootstrap results.',
  },
  {
    name: 'Empty state',
    required: false,
    description:
      'Disabled listbox option shown after a completed search returns no results.',
  },
  {
    name: 'Result group heading',
    required: false,
    description: 'Visible label for a group of result options.',
  },
  {
    name: 'Result row',
    required: false,
    description:
      'Option wrapper that owns highlight, selection, pointer, and keyboard behavior.',
  },
  {
    name: 'Default item content',
    required: false,
    description:
      'TypeaheadItem label and optional supporting content rendered inside a result row.',
  },
  {
    name: 'Caller-rendered item content',
    required: false,
    description:
      'Caller content supplied through renderItem or item.element inside the stable result row.',
  },
  {
    name: 'Selected result state',
    required: false,
    description:
      'Selected row weight and trailing check shown when a result matches value.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'BaseTypeahead',
  subComponentOf: 'Typeahead',
  displayName: 'Base Typeahead',
  isHiddenFromOverview: true,
  description:
    'Composable combobox engine providing a bare input, search, keyboard navigation, and a styled result dropdown. It renders no input wrapper, border, or selected-value token. Typeahead and Tokenizer compose it for standard fields.',
  usage: {
    anatomy,
    description:
      'Composable combobox engine providing a bare input, search, keyboard navigation, and a styled result dropdown. It renders no input wrapper, border, or selected-value token. Typeahead and Tokenizer compose it for standard fields.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use Typeahead or Tokenizer for standard fields; they wrap BaseTypeahead with input chrome and selected-value rendering it intentionally omits.',
      },
      {
        guidance: true,
        description:
          'Provide your own visible label or aria-label and custom input wrapper so the bare combobox has an accessible name, focus treatment, border, and layout.',
      },
      {
        guidance: true,
        description:
          'Pass anchorRef pointing to your wrapper so the dropdown positions against your custom input chrome, not just the bare input element.',
      },
      {
        guidance: false,
        description:
          'Expect input chrome or selected-value rendering. BaseTypeahead is an engine; the caller owns those visible parts.',
      },
      {
        guidance: false,
        description:
          'Use BaseTypeahead when Typeahead or Tokenizer would suffice; the extra wrapper and styling work is only justified for truly custom compositions.',
      },
      {
        guidance: false,
        description:
          'Treat Escape as cancellation of pending source work. It hides the current popup, but a late response can reopen it.',
      },
    ],
  },
  props: [
    {
      name: 'searchSource',
      type: 'SearchSource<T>',
      description: 'Data source providing search and bootstrap methods.',
      required: true,
    },
    {
      name: 'value',
      type: 'T | null',
      description: 'Currently selected item.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(item: T | null) => void',
      description: 'Called when the selection changes.',
      required: true,
    },
    {
      name: 'renderItem',
      type: '(item: T) => ReactNode',
      description: 'Custom render function for dropdown items.',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Input placeholder text.',
      default: "'Search…'",
    },
    {
      name: 'hasEntriesOnFocus',
      type: 'boolean',
      description: 'Show bootstrap results on focus before typing.',
      default: 'false',
    },
    {
      name: 'maxMenuItems',
      type: 'number',
      description: 'Maximum dropdown items to display.',
      default: '10',
    },
    {
      name: 'menuWidth',
      type: 'number',
      description:
        'Requested dropdown width in pixels before viewport clamping.',
    },
    {
      name: 'minQueryLength',
      type: 'number',
      description:
        'Minimum query length before the search source is queried. Below it no search runs and the menu stays closed.',
      default: '1',
    },
    {
      name: 'emptySearchText',
      type: 'ReactNode',
      description:
        'Content shown when the query matched nothing. Takes a ReactNode, so the dead end can carry a link or a create row. Announced in a polite live region as the text it renders, read from the DOM; aria-hidden parts stay out of both, and content that renders no text announces nothing. null counts as not given, like undefined, and falls through to the default; pass an empty string to render nothing.',
      default: "'No results found'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the input is disabled.',
      default: 'false',
    },
    {
      name: 'isFocusableDisabled',
      type: 'boolean',
      description:
        'Keep a disabled input focusable with aria-disabled and readOnly so a caller-owned disabled reason remains discoverable. It blocks text entry, opening the results and picking a result, also from results that were open before it applied; Escape or Tab still closes them.',
      default: 'false',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: 'Auto-focus the input on mount.',
      default: 'false',
    },
    {
      name: 'debounceMs',
      type: 'number',
      description:
        'Debounce delay in ms before triggering search. Set to 0 for synchronous sources.',
      default: '150',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size used to scale dropdown option padding.',
      default: "'md'",
    },
    {
      name: 'anchorRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        'Ref to the anchor element for dropdown positioning. If not provided, the input itself is used.',
    },
    {
      name: 'inputXStyle',
      type: 'StyleXStyles',
      description: 'Additional StyleX styles for the input element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'Standard BaseProps StyleX styles applied to the input. Must be a stylex.create() value, not an inline style object.',
    },
    {
      name: 'inputTabIndex',
      type: 'number',
      description:
        'Legacy input-specific alias for native tabIndex. When provided, it takes precedence; otherwise native tabIndex is preserved.',
    },
    {
      name: 'onKeyDown',
      type: '(e: React.KeyboardEvent<HTMLInputElement>) => void',
      description:
        'Additional keydown handler called before internal keyboard navigation. Call e.preventDefault() to skip internal handling.',
    },
    {
      name: 'onChangeQuery',
      type: '(query: string) => void',
      description: 'Callback fired when the search query text changes.',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Callback when the dropdown opens or closes.',
    },
    {
      name: 'inputId',
      type: 'string',
      description:
        'Legacy input-specific alias for native id. When provided, it takes precedence; otherwise native id is preserved.',
    },
    {
      name: 'ariaDescribedBy',
      type: 'string',
      description:
        'Legacy input-specific alias for native aria-describedby. When provided, it takes precedence; otherwise the native attribute is preserved.',
    },
    {
      name: 'ariaLabelledBy',
      type: 'string',
      description:
        'Legacy input-specific alias for native aria-labelledby. When provided, it takes precedence; otherwise the native attribute is preserved.',
    },
  ],
};

export const docsZh = {
  name: 'BaseTypeahead',
  isHiddenFromOverview: true,
  displayName: 'Base Typeahead',
  description:
    '可组合的组合框引擎，提供裸输入框、搜索、键盘导航和带样式的结果下拉列表。它不渲染输入框包装、边框或已选值标记；Typeahead 和 Tokenizer 将其组合成标准字段。',
  props: [
    {
      name: 'searchSource',
      type: 'SearchSource<T>',
      description: '提供搜索和引导方法的数据源。',
      required: true,
    },
    {
      name: 'value',
      type: 'T | null',
      description: '当前选中的项目。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(item: T | null) => void',
      description: '选择变更时调用。',
      required: true,
    },
    {
      name: 'renderItem',
      type: '(item: T) => ReactNode',
      description: '下拉列表项的自定义渲染函数。',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '输入框占位文本。',
      default: "'Search…'",
    },
    {
      name: 'hasEntriesOnFocus',
      type: 'boolean',
      description: '聚焦时在输入前显示引导结果。',
      default: 'false',
    },
    {
      name: 'maxMenuItems',
      type: 'number',
      description: '下拉列表显示的最大项目数。',
      default: '10',
    },
    {
      name: 'menuWidth',
      type: 'number',
      description: '视口限制前请求的下拉菜单像素宽度。',
    },
    {
      name: 'minQueryLength',
      type: 'number',
      description:
        '查询搜索源前的最小查询长度。低于该长度不会发起搜索，菜单保持关闭。',
      default: '1',
    },
    {
      name: 'emptySearchText',
      type: 'ReactNode',
      description:
        '查询无匹配结果时显示的内容。接受 ReactNode，因此可在无结果处放置链接或创建入口。会从 DOM 读取其渲染出的文本在礼貌性实时区域中播报；aria-hidden 的部分两处都不包含，不渲染任何文本的内容则不会播报。null 与 undefined 同样视为未提供，将回退到默认值；若要不渲染任何内容，请传入空字符串。',
      default: "'No results found'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '输入框是否被禁用。',
      default: 'false',
    },
    {
      name: 'isFocusableDisabled',
      type: 'boolean',
      description:
        '使用 aria-disabled 和只读状态保持禁用输入框可聚焦，以便访问调用方提供的禁用原因。它会阻止文本输入、打开结果列表和选择结果，在它生效前已打开的结果中也是如此；Escape 或 Tab 仍可关闭列表。',
      default: 'false',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: '挂载时自动聚焦输入框。',
      default: 'false',
    },
    {
      name: 'debounceMs',
      type: 'number',
      description: '触发搜索前的防抖延迟（毫秒）。同步数据源设置为 0。',
      default: '150',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '用于调整下拉选项内边距的尺寸。',
      default: "'md'",
    },
    {
      name: 'anchorRef',
      type: 'RefObject<HTMLElement | null>',
      description: '用于下拉列表定位的锚点元素引用。未提供时使用输入框本身。',
    },
    {
      name: 'inputXStyle',
      type: 'StyleXStyles',
      description: '输入元素的附加 StyleX 样式。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '应用于输入元素的标准 BaseProps StyleX 样式。',
    },
    {
      name: 'inputTabIndex',
      type: 'number',
      description:
        '原生 tabIndex 的旧输入专用别名。提供时优先；未提供时保留原生属性。',
    },
    {
      name: 'onKeyDown',
      type: '(e: React.KeyboardEvent<HTMLInputElement>) => void',
      description:
        '在内部键盘导航之前调用的附加 keydown 处理函数。调用 e.preventDefault() 可跳过内部处理。',
    },
    {
      name: 'onChangeQuery',
      type: '(query: string) => void',
      description: '搜索查询文本变更时触发的回调。',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: '下拉列表打开或关闭时的回调。',
    },
    {
      name: 'inputId',
      type: 'string',
      description:
        '原生 id 的旧输入专用别名。提供时优先；未提供时保留原生属性。',
    },
    {
      name: 'ariaDescribedBy',
      type: 'string',
      description:
        '原生 aria-describedby 的旧输入专用别名。提供时优先；未提供时保留原生属性。',
    },
    {
      name: 'ariaLabelledBy',
      type: 'string',
      description:
        '原生 aria-labelledby 的旧输入专用别名。提供时优先；未提供时保留原生属性。',
    },
  ],
};

export const docsDense = {
  name: 'BaseTypeahead',
  isHiddenFromOverview: true,
  displayName: 'Base Typeahead',
  description:
    'Composable combobox engine providing a bare input and a styled result dropdown. Callers own input chrome and selected-value presentation.',
  usage: {
    bestPractices: [
      {
        guidance: true,
        description:
          'Use Typeahead or Tokenizer for standard fields; they add the input chrome and selected-value rendering BaseTypeahead omits.',
      },
      {
        guidance: true,
        description:
          'Provide a visible label or aria-label plus a custom wrapper with focus treatment, border, and layout.',
      },
      {
        guidance: true,
        description:
          'Pass anchorRef to your wrapper so the dropdown positions against your input chrome, not the bare input.',
      },
      {
        guidance: false,
        description:
          'Expect input chrome or selected-value rendering. The caller owns those visible parts.',
      },
      {
        guidance: false,
        description:
          'Use BaseTypeahead when Typeahead or Tokenizer suffice; extra work only pays off for custom compositions.',
      },
      {
        guidance: false,
        description:
          'Treat Escape as pending-work cancellation. It hides the popup, but a late response can reopen it.',
      },
    ],
  },
  propDescriptions: {
    searchSource: 'Data source w/ search+bootstrap methods.',
    value: 'Currently selected item.',
    onChange: 'Fired on selection change.',
    renderItem: 'Custom dropdown item render.',
    placeholder: 'Input placeholder.',
    hasEntriesOnFocus: 'Bootstrap results on focus.',
    maxMenuItems: 'Max dropdown items.',
    menuWidth: 'Requested px width before viewport clamping.',
    minQueryLength:
      'Min query length before searching. Menu stays closed below it.',
    emptySearchText: 'Content when the query matched nothing. ReactNode.',
    isDisabled: 'Whether input disabled.',
    isFocusableDisabled:
      'Keeps disabled input focusable; blocks text entry, opening and picking, also from an already-open list (Escape/Tab close it).',
    hasAutoFocus: 'Auto-focus on mount.',
    debounceMs: 'Search debounce ms. 0 for sync.',
    size: 'Dropdown option padding size.',
    anchorRef: 'Anchor for dropdown positioning. Defaults to input.',
    inputXStyle: 'Additional StyleX styles for input.',
    xstyle: 'Standard BaseProps StyleX styles for input.',
    inputTabIndex:
      'Legacy tabIndex alias; defined alias wins, otherwise native tabIndex passes through.',
    onKeyDown:
      'Keydown before internal nav. preventDefault() skips internal handling.',
    onChangeQuery: 'Fired on query text change.',
    onOpenChange: 'Fired on dropdown open/close.',
    inputId:
      'Legacy id alias; defined alias wins, otherwise native id passes through.',
    ariaDescribedBy:
      'Legacy aria-describedby alias; defined alias wins, otherwise native attribute passes through.',
    ariaLabelledBy:
      'Legacy aria-labelledby alias; defined alias wins, otherwise native attribute passes through.',
  },
};
