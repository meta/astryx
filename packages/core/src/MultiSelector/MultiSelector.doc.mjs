// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Field',
    required: false,
    description:
      'Standalone Field shell that provides the label and optional supporting content; omitted inside InputGroup.',
  },
  {
    name: 'Trigger',
    required: true,
    description:
      'Painted control that displays the current selection or placeholder and opens the selection surface when editable.',
  },
  {
    name: 'Icon-rendered start icon',
    required: false,
    description:
      'Optional leading semantic icon or icon component rendered through Icon.',
  },
  {
    name: 'Caller-rendered start content',
    required: false,
    description:
      'Optional arbitrary React content rendered directly at the start of the trigger.',
  },
  {
    name: 'Trigger clear button',
    required: false,
    description:
      'Shared clear action that removes every selected value when hasClear is enabled.',
  },
  {
    name: 'Status icon',
    required: false,
    description:
      'Status glyph shown in place of the disclosure indicator for attached or tooltip status.',
  },
  {
    name: 'Indicator icon',
    required: false,
    description:
      'Trailing chevron shown when status presentation does not replace it; reflects collapsed or expanded state.',
  },
  {
    name: 'Search row',
    required: false,
    description:
      'Panel header with a borderless search input and optional clear action.',
  },
  {
    name: 'Search icon',
    required: false,
    description:
      'Leading magnifier rendered through Icon inside the search row.',
  },
  {
    name: 'Search clear button',
    required: false,
    description:
      'Shared clear action shown in the search row while a query is present.',
  },
  {
    name: 'Option row',
    required: false,
    description:
      'Selectable row for an option or the optional select-all choice.',
  },
  {
    name: 'Option checkbox indicator',
    required: false,
    description:
      'CheckboxInput indicator that presents each row’s selected, unselected, or indeterminate state.',
  },
  {
    name: 'Option divider',
    required: false,
    description:
      'Divider supplied in the public options data to separate adjacent option groups.',
  },
  {
    name: 'Section heading',
    required: false,
    description: 'Visible heading for a labeled group of option rows.',
  },
  {
    name: 'Empty state',
    required: false,
    description:
      'Message shown when the shared panel content has no options or no search matches.',
  },
  {
    name: 'Pointer popup',
    required: false,
    description:
      'Anchored painted surface that hosts the shared panel content for popover presentation.',
  },
  {
    name: 'Touch sheet heading',
    required: false,
    description:
      'Heading above the shared panel content in bottom-sheet presentation.',
  },
  {
    name: 'Touch sheet',
    required: false,
    description:
      'BottomSheet surface that hosts the same panel content for bottom-sheet presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MultiSelector',
  displayName: 'Multi Selector',
  group: 'Selector',
  category: 'Form Controls',
  keywords: [
    'multiselect',
    'checkbox',
    'dropdown',
    'multi',
    'picker',
    'checklist',
    'facet',
    'filter',
    'select',
  ],
  playground: {
    defaults: {
      label: 'Fruit',
      options: [
        {value: 'apple', label: 'Apple'},
        {value: 'orange', label: 'Orange'},
        {value: 'banana', label: 'Banana'},
      ],
      value: [],
    },
  },
  theming: {
    targets: [
      {
        className: 'astryx-multi-selector',
        visualProps: ['variant', 'size', 'status'],
        states: ['disabled', 'readonly'],
      },
      {className: 'astryx-multi-selector-empty-state'},
      {className: 'astryx-multi-selector-search'},
      {className: 'astryx-multi-selector-section-heading'},
      {
        className: 'astryx-multi-selector-indicator-icon',
        states: ['state'],
      },
      {
        className: 'astryx-multi-selector-option',
        visualProps: ['size'],
        states: ['select-all', 'selected', 'disabled'],
      },
      {className: 'astryx-multi-selector-popup'},
    ],
  },
  components: [
    {
      name: 'MultiSelector',
      displayName: 'Multi Selector',
      description:
        'Multi-select dropdown with checkboxes for choosing multiple items.',
      props: [
        {
          name: 'label',
          type: 'string',
          description: 'Label text for accessibility.',
          required: true,
        },
        {
          name: 'options',
          type: 'MultiSelectorOptionType[]',
          description:
            'Array of items: strings, objects with value/label/icon/disabled, dividers, or sections. An option may carry `action`: one node — an IconButton, a Button, a menu trigger — the caller renders and names. Once any option does, the popup is a grid whose rows pair the option with its action: Up/Down move rows, the inline-end arrow reaches the action, Enter fires it, pointer and touch press it directly, and pressing it never changes the selection.',
          required: true,
        },
        {
          name: 'value',
          type: 'string[]',
          description: 'Currently selected values.',
          required: true,
        },
        {
          name: 'onChange',
          type: '(value: string[], change?: MultiSelectorChange) => void',
          description:
            'Called when the selection changes. A creation (hasCreate) arrives with `{type: "create", query}` as the second argument and the query appended to value; the caller adds the matching option in that same update. Every other change passes no descriptor, so a one-argument handler keeps working.',
          required: true,
        },
        {
          name: 'changeAction',
          type: '(value: string[]) => void | Promise<void>',
          description: 'Async action on change. Fires after onChange.',
        },
        {
          name: 'placeholder',
          type: 'string',
          description: 'Placeholder text shown when no value is selected.',
          default: "'Select...'",
        },
        {
          name: 'size',
          type: "'sm' | 'md' | 'lg'",
          description: 'Size variant for the selector.',
          default: "'md'",
        },
        {
          name: 'variant',
          type: "'input' | 'secondary' | 'ghost'",
          description:
            'Visual trigger style. input is the bordered input treatment for forms; secondary matches the secondary buttons of the active theme (borderless and neutral-filled by default) for navs and toolbars; ghost is borderless and transparent, matching ghost buttons for toolbar usage.',
          default: "'input'",
        },
        {
          name: 'triggerDisplay',
          type: "'count' | 'labels' | 'badges'",
          description: 'How to display selected items in the trigger.',
          default: "'count'",
        },
        {
          name: 'formatValue',
          type: '(items: {value: string; label: string}[]) => string',
          description:
            'Formats the trigger text when triggerDisplay="count" or "labels". Receives the selected items (value plus resolved label); the count is items.length. Not used by triggerDisplay="badges".',
        },
        {
          name: 'maxBadges',
          type: 'number',
          description:
            'Maximum badges to show before "+N". Only for triggerDisplay="badges".',
          default: '3',
        },
        {
          name: 'hasSelectAll',
          type: 'boolean',
          description: 'Whether to show a select-all checkbox.',
        },
        {
          name: 'selectAllLabel',
          type: 'string',
          description: 'Label for the select-all checkbox.',
          default: "'Select all'",
        },
        {
          name: 'hasSearch',
          type: 'boolean',
          description:
            'Whether to show a search input for filtering options. As the user types, the match count (or "No results found") is announced to screen readers via a polite live region. The search field has built-in affordances: a leading magnifier icon and, once a query is typed, a trailing clear (✕) button that resets the query and returns focus to the input.',
        },
        {
          name: 'searchPlaceholder',
          type: 'string',
          description: 'Placeholder text for the search input.',
          default: "'Search...'",
        },
        {
          name: 'emptyText',
          type: 'ReactNode',
          description:
            'Content shown in the dropdown panel when there are no options to show, and announced in a polite live region when the panel opens. The announcement is the text this content renders, read from the DOM, so an element is announced as written and aria-hidden parts are left out of both. Not shown while isLoading.',
          default: "'No options'",
        },
        {
          name: 'emptySearchText',
          type: 'ReactNode',
          description:
            'Content shown in the dropdown panel when a search query matches no options, and announced in a polite live region at the same time. The announcement is the text this content renders, read from the DOM, so an element is announced as written and aria-hidden parts are left out of both.',
          default: "'No results found'",
        },
        {
          name: 'hasCreate',
          type: 'boolean',
          description:
            'With hasSearch, offers a `Create "<query>"` row first in the list when the typed text equals no option label under the search’s case-insensitive matching. Picking it, or Enter with nothing highlighted, calls onChange with the query appended to value and a `{type: "create", query}` descriptor, then clears the search; the caller must add an option for the new value in that update. Nothing is offered while isLoading. Without hasSearch it warns in development and offers nothing.',
          default: 'false',
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description: 'Disables the selector.',
        },
        {
          name: 'isReadOnly',
          type: 'boolean',
          description:
            'Makes the selector read-only: the selected values stay visible, focusable, and included in form submission, and retain their combobox identity with aria-readonly. The selection surface, clear action, and disclosure indicator are removed. Unlike isDisabled, the control is not dimmed. isDisabled takes precedence when both are set.',
          default: 'false',
        },
        {
          name: 'htmlName',
          type: 'string',
          description:
            'The HTML name attribute for form submissions. Renders one hidden input per selected value, like a native multi-select.',
        },
        {
          name: 'disabledMessage',
          type: 'string',
          description:
            'Explains why the selector is disabled. With isDisabled, shows the reason as a tooltip on hover and keyboard focus of the trigger, which stays focusable (aria-disabled) like every disabled selector; activation stays blocked. Use this instead of wrapping a disabled MultiSelector in Tooltip.',
        },
        {
          name: 'isLabelHidden',
          type: 'boolean',
          description: 'Visually hides the label while keeping it accessible.',
        },
        {
          name: 'description',
          type: 'string',
          description: 'Helper text displayed below the label.',
        },
        {
          name: 'isOptional',
          type: 'boolean',
          description: 'Marks the field as optional.',
        },
        {
          name: 'isRequired',
          type: 'boolean',
          description: 'Marks the field as required.',
        },
        {
          name: 'isLoading',
          type: 'boolean',
          description: 'Shows a loading spinner in the trigger.',
        },
        {
          name: 'status',
          type: "{type: 'error' | 'warning' | 'success', message?: string}",
          description: 'Validation status with an optional message.',
        },
        {
          name: 'statusVariant',
          type: "'attached' | 'detached' | 'tooltip'",
          description:
            'How the status message is placed relative to the input. attached overlaps directly below the bordered input and is only valid for the input variant; secondary and ghost selectors detach attached status messages by default. Use tooltip for compact toolbar controls.',
          default:
            "'attached' for input selectors; 'detached' for secondary and ghost selectors",
        },
        {
          name: 'renderOption',
          type: '(option: MultiSelectorOptionData) => ReactNode',
          description:
            'Custom render function for each selectable option in the dropdown. Not called for dividers, sections, or the select-all row.',
        },
        {
          name: 'indicatorPosition',
          type: "'start' | 'end'",
          description:
            'Which edge of the option row carries the checkbox. end pushes it to the far edge of the row, including on the select-all row.',
          default: "'start'",
        },
        {
          name: 'presentation',
          type: "'popover' | 'bottom-sheet' | 'adaptive'",
          description:
            'How the option list is presented. adaptive uses a bottom sheet on compact touch screens and an anchored popover otherwise.',
          default: "'popover'",
        },
        {
          name: 'width',
          type: 'SizeValue',
          description:
            'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
        },
        {
          name: 'startIcon',
          type: 'IconType | ReactNode',
          description: 'Icon displayed at the start of the selector trigger.',
        },
        {
          name: 'hasClear',
          type: 'boolean',
          description: 'Shows a clear button when values are selected.',
          default: 'false',
        },
        {
          name: 'isDefaultOpen',
          type: 'boolean',
          description: 'Whether the dropdown starts open on mount.',
          default: 'false',
        },
        {
          name: 'renderTrigger',
          type: '(props: MultiSelectorRenderTriggerProps) => ReactNode',
          description:
            "Render the control the panel hangs off — a glyph in a list row, a chip, an icon button — instead of the selector's own field and button. Spread the given props ({ref, id, onClick, onKeyDown, onFocus, aria-haspopup, aria-expanded, aria-controls, aria-busy}) onto it; the listbox is anchored to that control and named by `label`. The field chrome (Field, status, clear, spinner) is not rendered. Pair with handleRef to open from a keystroke elsewhere.",
        },
        {
          name: 'handleRef',
          type: 'React.Ref<MultiSelectorHandle>',
          description:
            'Imperative handle with open(), close(), toggle() and isOpen(). Prefer it over mirroring open state in the parent; the selector owns its visibility.',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description:
            'Called whenever the panel opens or closes, however it happened: the trigger, the keyboard, a light dismiss, Escape, or the handle.',
        },
        {
          name: 'onClick',
          type: '(event: MouseEvent) => void',
          description:
            'Click handler on the trigger (or the renderTrigger control). Runs after the built-in toggle and cannot cancel it.',
        },
        {
          name: 'onFocus',
          type: '(event: FocusEvent) => void',
          description:
            "Focus handler on the trigger. Runs before the selector's own focus handling.",
        },
        {
          name: 'onKeyDown',
          type: '(event: KeyboardEvent) => void',
          description:
            'Key handler on the trigger button. Runs after the built-in keyboard model and is skipped for keys it handles and cancels.',
        },
        {
          name: 'containerXstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted.',
        },
        {
          name: 'containerClassName',
          type: 'string',
          description:
            'Class name for the field container. Same targeting as `containerXstyle`.',
        },
        {
          name: 'containerStyle',
          type: 'CSSProperties',
          description:
            'Inline styles for the field container. Same targeting as `containerXstyle`.',
        },
        {
          name: 'controlXstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for the visual control box: the element that paints the border and background and holds the value, icons, and end controls. Never the trigger button itself.',
        },
        {
          name: 'controlClassName',
          type: 'string',
          description: 'Class name for the visual control box.',
        },
        {
          name: 'controlStyle',
          type: 'CSSProperties',
          description: 'Inline styles for the visual control box.',
        },
      ],
    },
  ],
  usage: {
    anatomy,
    description:
      'A checkbox dropdown for selecting multiple values from a list. Selected items can display as a count, labels, or badges. Use it for filtering or when presenting a finite set of options where multiple choices are needed.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for a moderate, finite set of options where multiple choices are needed.',
      },
      {
        guidance: true,
        description:
          'Enable search filtering when the list exceeds ~15 options.',
      },
      {
        guidance: true,
        description:
          'Use renderOption for custom option rows; the checkbox affordance remains owned by MultiSelector.',
      },
      {
        guidance: true,
        description:
          'Enable select-all when most users will want all or nearly all options selected.',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup only when the control needs a short prefix or suffix addon as part of one decorated input surface; prefer count or labels trigger display so the group stays single-line.',
      },
      {
        guidance: true,
        description:
          'Use variant="secondary" when a multi-selector sits beside secondary buttons or segmented controls, and variant="ghost" when it sits beside ghost buttons. If validation status is needed there, prefer statusVariant="tooltip" so the toolbar height stays compact.',
      },
      {
        guidance: true,
        description:
          'Use presentation="adaptive" when the multi-selector should become a bottom sheet on compact touch screens.',
      },
      {
        guidance: false,
        description: 'Use for single-value selection; use Selector instead.',
      },
      {
        guidance: false,
        description: 'Show more than ~20 options without enabling search.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled MultiSelector in Tooltip to explain why it is disabled. Use the disabledMessage prop, which attaches the reason to the trigger itself.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  components: [
    {
      name: 'MultiSelector',
      displayName: 'Multi Selector',
      description: '带复选框的多选下拉框，用于从列表中选择多项。',
      propDescriptions: {
        label: '无障碍标签文本。',
        options:
          '项目数组——字符串、带 value/label/icon/disabled 的对象、分隔线或分组。',
        value: '当前选中的值。',
        onChange: '选择变化时触发的回调。',
        changeAction: '变化时的异步操作，在 onChange 之后触发。',
        placeholder: '未选择值时显示的占位文本。',
        size: '选择器的尺寸变体。',
        triggerDisplay: '在触发器中显示选中项的方式。',
        formatValue:
          '格式化 triggerDisplay="count" 或 "labels" 时的触发器文本。接收选中项（value 及解析后的 label），数量为 items.length。triggerDisplay="badges" 不使用此属性。',
        maxBadges:
          '显示"+N"之前的最大徽章数。仅适用于 triggerDisplay="badges"。',
        hasSelectAll: '是否显示全选复选框。',
        selectAllLabel: '全选复选框的标签。',
        hasSearch: '是否显示用于过滤选项的搜索输入。',
        searchPlaceholder: '搜索输入的占位文本。',
        emptyText: '没有可显示的选项时，下拉面板中显示的内容。',
        emptySearchText: '搜索查询未匹配到任何选项时，下拉面板中显示的内容。',
        hasCreate:
          '配合 hasSearch：当输入的文本与任何选项标签都不匹配时，在列表首行提供“创建 "<query>"”行；选中后通过 onChange 以 {type: "create", query} 描述符报告，调用方需在同一次更新中添加该选项。',
        isDisabled: '禁用选择器。',
        isReadOnly:
          '将选择器设为只读：保留当前值、焦点顺序和表单提交，但移除选择面板、清除操作和展开指示器。与 isDisabled 不同，只读控件不会变暗；两者同时设置时 isDisabled 优先。',
        htmlName:
          '用于表单提交的 HTML name 属性。为每个已选值渲染一个隐藏输入，类似原生多选。',
        disabledMessage:
          '解释选择器被禁用的原因。与 isDisabled 一起使用时，悬停/键盘聚焦时显示工具提示，触发器与所有被禁用的选择器一样通过 aria-disabled 保持可聚焦（仍无法激活）。请使用此属性，而不是用 Tooltip 包裹被禁用的选择器。',
        isLabelHidden: '视觉上隐藏标签同时保持其可访问性。',
        description: '标签下方显示的辅助文本。',
        isOptional: '将字段标记为可选。',
        isRequired: '将字段标记为必填。',
        isLoading: '在触发器中显示加载旋转器。',
        status: '带可选消息的验证状态。',
        statusVariant:
          '状态消息的放置方式：attached 直接叠加在输入框下方；detached 作为独立元素浮于下方并留有间距。',
        renderOption:
          '每个可选选项的自定义渲染函数。不会用于分隔线、分组或全选行。',
        renderTrigger:
          '由调用方渲染面板的触发控件（替代选择器自带的字段和按钮）；将传入的属性展开到该控件上，列表框将锚定于它并由 label 命名。',
        handleRef: '命令式句柄：open()、close()、toggle()、isOpen()。',
        onOpenChange: '面板每次打开或关闭时触发，无论由何种方式引起。',
        presentation:
          '选项列表的呈现方式：锚定弹出框、底部抽屉，或根据紧凑触控屏自适应。',
        onClick: '触发器的点击处理函数，在内置开关之后运行，无法取消它。',
        onFocus: '触发器的焦点处理函数，在选择器自身的焦点处理之前运行。',
        onKeyDown:
          '触发器的按键处理函数，在内置键盘模型之后运行；该模型处理并取消的按键不会传给它。',
        containerXstyle:
          '字段容器（标签、控件和状态整体）的 StyleX 样式。在 InputGroup 内或 `horizontal-labels` FormLayout 中无效。不接受根级 xstyle、className 和 style。',
        containerClassName: '字段容器的类名，作用目标同 containerXstyle。',
        containerStyle: '字段容器的内联样式，作用目标同 containerXstyle。',
        controlXstyle:
          '可视控件框的 StyleX 样式：绘制边框和背景并包含值、图标与尾部控件的元素，而非触发按钮本身。',
        controlClassName: '可视控件框的类名。',
        controlStyle: '可视控件框的内联样式。',
      },
    },
  ],
  usage: {
    description:
      'A checkbox dropdown for selecting multiple values from a list. Selected items can display as a count, labels, or badges. Use it for filtering or when presenting a finite set of options where multiple choices are needed.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for a moderate, finite set of options where multiple choices are needed.',
      },
      {
        guidance: true,
        description:
          'Enable search filtering when the list exceeds ~15 options.',
      },
      {
        guidance: true,
        description:
          'Use renderOption for custom option rows; the checkbox affordance remains owned by MultiSelector.',
      },
      {
        guidance: true,
        description:
          'Enable select-all when most users will want all or nearly all options selected.',
      },
      {
        guidance: false,
        description: 'Use for single-value selection; use Selector instead.',
      },
      {
        guidance: false,
        description: 'Show more than ~20 options without enabling search.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled MultiSelector in Tooltip to explain why it is disabled. Use the disabledMessage prop, which attaches the reason to the trigger itself.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'checkbox multi-select dropdown for finite sets like column toggles or filter facets',
  usage: {
    description:
      'A checkbox dropdown for selecting multiple values from a list. Selected items can display as a count, labels, or badges. Use it for filtering or when presenting a finite set of options where multiple choices are needed.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for a moderate, finite set of options where multiple choices are needed.',
      },
      {
        guidance: true,
        description:
          'Enable search filtering when the list exceeds ~15 options.',
      },
      {
        guidance: true,
        description:
          'renderOption for custom rows; checkbox affordance stays owned by MultiSelector.',
      },
      {
        guidance: true,
        description:
          'Enable select-all when most users will want all or nearly all options selected.',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup only for a short prefix or suffix addon; prefer count or labels trigger display so the group stays single-line.',
      },
      {
        guidance: true,
        description:
          'Use variant="secondary" beside secondary buttons or segmented controls and variant="ghost" beside ghost buttons; prefer statusVariant="tooltip" for compact validation status.',
      },
      {
        guidance: false,
        description: 'Use for single-value selection; use Selector instead.',
      },
      {
        guidance: false,
        description: 'Show more than ~20 options without enabling search.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled MultiSelector in Tooltip to explain why it is disabled. Use the disabledMessage prop, which attaches the reason to the trigger itself.',
      },
    ],
  },
  components: [
    {
      name: 'MultiSelector',
      displayName: 'Multi Selector',
      description: 'checkbox multi-select dropdown',
      propDescriptions: {
        label: 'a11y label',
        options:
          'items: strings, objects w/ value/label/icon/disabled, dividers, sections',
        value: 'selected values',
        onChange: 'callback on selection change',
        changeAction: 'async; fires after onChange',
        placeholder: 'text when nothing selected',
        size: 'size variant',
        variant:
          'visual trigger style: input bordered control, secondary control matching the theme secondary buttons, or ghost transparent control',
        triggerDisplay: 'how to show selected in trigger',
        formatValue:
          'formats count/labels trigger text; receives selected items',
        maxBadges: 'max badges before "+N"; badges mode only',
        hasSelectAll: 'show select-all checkbox',
        selectAllLabel: 'select-all label',
        hasSearch: 'show search input',
        searchPlaceholder: 'search placeholder',
        emptyText: 'panel content when there are no options',
        emptySearchText: 'panel content when the query matches nothing',
        hasCreate:
          'with hasSearch: first row is Create "<query>" when no option label matches; reported through onChange with a {type: "create", query} descriptor; caller adds the option',
        isDisabled: 'disables selector',
        isReadOnly:
          'read-only: preserves values, focus + form submission; removes menu, clear + disclosure',
        htmlName: 'HTML name attr; one hidden input per selected value.',
        disabledMessage:
          'why disabled; w/ isDisabled shows tooltip on hover/focus, trigger stays focusable via aria-disabled; use instead of Tooltip wrapper',
        isLabelHidden: 'visually hides label',
        description: 'helper text below label',
        isOptional: 'marks optional',
        isRequired: 'marks required',
        isLoading: 'spinner in trigger',
        status: 'validation status w/ optional message',
        statusVariant:
          'status message placement; secondary and ghost detach attached by default; use tooltip for compact toolbars.',
        renderOption:
          'custom render fn per selectable option; not dividers/sections/select-all',
        renderTrigger:
          'caller-rendered opener replacing the field+button; spread the given props; listbox anchored to it, named by label',
        handleRef: 'imperative open()/close()/toggle()/isOpen()',
        onOpenChange: 'fires on every open/close, whatever caused it',
        presentation:
          'popover, bottom-sheet, or compact-touch adaptive presentation',
        onClick:
          'trigger click; runs after the built-in toggle, cannot cancel it',
        onFocus: 'trigger focus; runs before built-in focus handling',
        onKeyDown: 'trigger keys; runs after the built-in keyboard model',
        containerXstyle:
          'StyleX styles for the field container; no effect in InputGroup or horizontal-labels FormLayout. No root xstyle/className/style.',
        containerClassName: 'Class name for the field container.',
        containerStyle: 'Inline styles for the field container.',
        controlXstyle:
          'StyleX styles for the visual control box (border, background, icons); not the trigger button.',
        controlClassName: 'Class name for the visual control box.',
        controlStyle: 'Inline styles for the visual control box.',
      },
    },
  ],
};
