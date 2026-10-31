// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DateInput',
  displayName: 'Date Input',
  group: 'DateInput',
  category: 'Form Controls',
  keywords: [
    'dateinput',
    'datepicker',
    'datefield',
    'calendar',
    'dateselect',
    'dateentry',
    'datechooser',
  ],
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label text.',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Visually hide the label.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Helper text displayed below the label.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: 'Show an "(optional)" indicator next to the label.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: 'Mark the field as required.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disable the input and calendar. The field stays focusable and exposes `aria-disabled`; typing and opening are blocked.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus (activation stays blocked). Use this instead of wrapping a disabled DateInput in Tooltip.',
    },
    {
      name: 'value',
      type: 'ISODateString',
      description: 'Selected date in YYYY-MM-DD format.',
    },
    {
      name: 'onChange',
      type: '(value: ISODateString | undefined) => void',
      description: 'Callback invoked when the selected date changes.',
    },
    {
      name: 'changeAction',
      type: '(value: ISODateString | undefined) => void | Promise<void>',
      description:
        'Async action fired after onChange. Drives optimistic UI updates via useTransition.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Whether the input is in a loading state. The field stays focusable and exposes `aria-busy` with a spinner; typing, picking, and clearing are blocked until loading ends.',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISODateString',
      description: 'Minimum selectable date (YYYY-MM-DD).',
    },
    {
      name: 'max',
      type: 'ISODateString',
      description: 'Maximum selectable date (YYYY-MM-DD).',
    },
    {
      name: 'dateConstraints',
      type: 'ReadonlyArray<(date: Date) => boolean>',
      description:
        'Array of custom constraint functions that disable specific dates.',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text shown in the text input.',
      default: "'Select a date'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size of the input control.',
      default: "'md'",
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description:
        'Status indicator object for error, warning, or success states with a message.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip hides the message box and surfaces it in a tooltip on the status icon.',
      default: "'attached'",
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        'Tooltip text displayed via an info icon at the end of the label.',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows a clear (\u00d7) button when a date value is set. Clicking it clears the value and returns focus to the input.',
      default: 'false',
    },
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description:
        'Number of months displayed simultaneously in the calendar popover.',
      default: '1',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        'First day of week in Astryx calendar surfaces. A number (0 = Sunday to 6 = Saturday) or a three-letter day name; native pickers remain browser/OS-owned.',
      default: '0',
    },
    {
      name: 'format',
      type: "'date' | 'date_long' | 'date_weekday' | 'system_date' | ((value: ISODateString) => string)",
      description:
        "How the committed date value is displayed. Named values are reused from Timestamp's format vocabulary: 'date' shows 'Mar 21, 2026', 'date_long' shows 'March 21, 2026', 'date_weekday' shows 'Wed, Mar 21, 2026', 'system_date' shows '2026-03-21'. A function receives the ISO value and returns a custom string. Applies only to the committed value, never to text being typed.",
      default: "'date_long'",
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'",
      description:
        "Which surface draws the date picker. 'adaptive-native' (the default) uses Astryx's calendar popover on a fine pointer and the browser/OS picker (input type=date) on a coarse pointer, keeping Astryx fallbacks where a native control cannot express the value; 'native' always uses the browser/OS picker with no fallback; 'adaptive-bottom-sheet' uses the popover on a fine pointer and Astryx's bottom-sheet picker on a coarse pointer; 'popover' and 'bottom-sheet' force that Astryx surface on every pointer. Every value opens a picker; a typed-only field is TimeInput's alone. Use a non-native presentation for a field that needs weekStartsOn, numberOfMonths or dateConstraints, none of which a native picker can express.",
      default: "'adaptive-native'",
    },
    {
      name: 'nativePicker',
      type: "'touch' | 'always' | 'never'",
      description:
        "Deprecated: use presentation ('touch' = 'adaptive-native', 'always' = 'native', 'never' = 'adaptive-bottom-sheet'). Still works exactly as released; presentation wins when both are set.",
      default: "'touch'",
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the Field box around the label, control, and status. containerClassName and containerStyle take a class name and inline styles for the same box. No effect (development warning) where no Field box renders: inside InputGroup (style the group) and in a horizontal-labels FormLayout.',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description:
        'Class name for the Field box. Same targeting as containerXstyle.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description:
        'Inline styles for the Field box. Same targeting as containerXstyle.',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the bordered element that holds the text, icons, and end controls, never the native input. controlClassName and controlStyle take a class name and inline styles for the same box. Replaces root xstyle, className, and style, which this component does not accept.',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description:
        'Class name for the visual control box. Same targeting as controlXstyle.',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description:
        'Inline styles for the visual control box. Same targeting as controlXstyle.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-date-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
      {className: 'astryx-date-input-toggle-icon', states: ['state']},
    ],
  },
  usage: {
    description:
      'DateInput lets the user type or pick a date from a calendar popover. Use it for scheduling, deadlines, booking dates, or any form field that needs a specific calendar date.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the date input, the element that is focused and announced. A DOM handler runs after DateInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Provide clear labels and descriptions so users understand what date is expected.',
      },
      {
        guidance: true,
        description:
          'Use min, max, and dateConstraints to restrict selectable dates to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Use hasClear when the date is optional so the user can reset it.',
      },
      {
        guidance: true,
        description:
          'Show a loading state with changeAction when the date triggers a server-side save.',
      },
      {
        guidance: true,
        description:
          'On a fine pointer the field follows the WAI-ARIA combobox pattern with a dialog popup, as in the APG date picker combobox: ArrowDown or Alt+ArrowDown opens the calendar, and Escape closes it and returns focus to the field.',
      },
      {
        guidance: true,
        description:
          'Use DateInput inside InputGroup when adding a short static prefix or suffix, such as a due-date hint.',
      },
      {
        guidance: false,
        description:
          'Use a DateInput for free-form text that does not represent a calendar date.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the field purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Rely on the calendar alone; the text input lets users type dates directly, which is faster for known dates.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description: 'Text above the input describing what date is expected.',
      },
      {
        name: 'Text input',
        required: true,
        description:
          'A field where the user can type a date directly. Parses common formats like MM/DD/YYYY.',
      },
      {
        name: 'Calendar icon',
        required: true,
        description:
          'A button that opens the calendar popover for visual date picking.',
      },
      {
        name: 'Calendar popover',
        required: false,
        description:
          'A month grid that appears when the icon or the input is clicked, or when ArrowDown is pressed in the input.',
      },
      {
        name: 'Clear button',
        required: false,
        description:
          'A × button that resets the date value. Shown when hasClear is true and a date is set.',
      },
      {
        name: 'Status message',
        required: false,
        description: 'An error, warning, or success message below the input.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'DateInput',
  displayName: 'Date Input',
  usage: {
    description:
      'DateInput lets the user type or pick a date from a calendar popover. Use it for scheduling, deadlines, booking dates, or any form field that needs a specific calendar date.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the date input, the element that is focused and announced. A DOM handler runs after DateInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Provide clear labels and descriptions so users understand what date is expected.',
      },
      {
        guidance: true,
        description:
          'Use min, max, and dateConstraints to restrict selectable dates to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Use hasClear when the date is optional so the user can reset it.',
      },
      {
        guidance: true,
        description:
          'Show a loading state with changeAction when the date triggers a server-side save.',
      },
      {
        guidance: true,
        description:
          'On a fine pointer the field follows the WAI-ARIA combobox pattern with a dialog popup, as in the APG date picker combobox: ArrowDown or Alt+ArrowDown opens the calendar, and Escape closes it and returns focus to the field.',
      },
      {
        guidance: false,
        description:
          'Use a DateInput for free-form text that does not represent a calendar date.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the field purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Rely on the calendar alone; the text input lets users type dates directly, which is faster for known dates.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
  },
  props: [
    {name: 'label', type: 'string', description: '标签文本。', required: true},
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '视觉隐藏标签。',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: '显示在标签下方的辅助文本。',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '在标签旁显示"(optional)"指示器。',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: '将字段标记为必填。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        '禁用输入框和日历。输入框仍可聚焦并暴露 `aria-disabled`，但不能输入或打开日历。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明输入框为何被禁用。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示提示（仍阻止输入和激活）。请使用此属性，而不是用 Tooltip 包裹已禁用的 DateInput。',
    },
    {
      name: 'value',
      type: 'ISODateString',
      description: '选中的日期，YYYY-MM-DD 格式。',
    },
    {
      name: 'onChange',
      type: '(value: ISODateString | undefined) => void',
      description: '选中日期变更时调用的回调。',
    },
    {
      name: 'changeAction',
      type: '(value: ISODateString | undefined) => void | Promise<void>',
      description:
        '在 onChange 之后触发的异步操作。通过 useTransition 驱动乐观更新。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        '输入框是否处于加载状态。字段仍可聚焦，并通过 `aria-busy` 和加载指示器表示忙碌；加载结束前不能输入、选择或清除日期。',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISODateString',
      description: '可选择的最早日期（YYYY-MM-DD）。',
    },
    {
      name: 'max',
      type: 'ISODateString',
      description: '可选择的最晚日期（YYYY-MM-DD）。',
    },
    {
      name: 'dateConstraints',
      type: 'ReadonlyArray<(date: Date) => boolean>',
      description: '自定义约束函数数组，用于禁用特定日期。',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '文本输入框中显示的占位符文本。',
      default: "'Select a date'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '输入控件的尺寸。',
      default: "'md'",
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description: '错误、警告或成功状态的状态指示对象，附带消息。',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        '状态消息相对于输入框的放置方式。attached 直接叠加在输入框下方（带边框处理）；detached 作为独立元素浮于下方并留有间距；tooltip 隐藏消息框，并在状态图标上以提示气泡形式显示。',
      default: "'attached'",
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: '通过标签末尾的信息图标显示的提示文本。',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: '有日期值时显示清除按钮。点击后清除日期。',
      default: 'false',
    },
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description: '日历弹出层中同时显示的月份数量。',
      default: '1',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        'Astryx 日历表面中每周的起始日。可为数字（0=周日……6=周六）或三字母星期缩写；原生选择器仍由浏览器或操作系统控制。',
      default: '0',
    },
    {
      name: 'format',
      type: "'date' | 'date_long' | 'date_weekday' | 'system_date' | ((value: ISODateString) => string)",
      description:
        "已选日期的显示格式。命名值复用 Timestamp 的格式词汇：'date' 显示 'Mar 21, 2026'，'date_long' 显示 'March 21, 2026'，'date_weekday' 显示 'Wed, Mar 21, 2026'，'system_date' 显示 '2026-03-21'。函数接收 ISO 值并返回自定义字符串。仅作用于已提交的值，不影响正在输入的文本。",
      default: "'date_long'",
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'",
      description:
        "由哪个界面绘制日期选择器。'adaptive-native'（默认）在精细指针上使用 Astryx 日历弹出层、在粗指针上使用浏览器/操作系统选择器（input type=date），且原生控件无法表达值时保留 Astryx 回退；'native' 始终使用浏览器/操作系统选择器且不回退；'adaptive-bottom-sheet' 在精细指针上用弹出层、在粗指针上用 Astryx 底部选择器；'popover' 与 'bottom-sheet' 在任何指针上强制使用对应 Astryx 界面。每个值都会打开选择器；仅输入字段的呈现只属于 TimeInput。需要 weekStartsOn、numberOfMonths 或 dateConstraints 的字段应使用非原生呈现，原生选择器无法表达这些。",
      default: "'adaptive-native'",
    },
    {
      name: 'nativePicker',
      type: "'touch' | 'always' | 'never'",
      description:
        "已弃用：请使用 presentation（'touch'='adaptive-native'、'always'='native'、'never'='adaptive-bottom-sheet'）。仍按已发布行为工作；同时设置时以 presentation 为准。",
      default: "'touch'",
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        '字段宽度（数字按像素处理，字符串按原样使用，例如 “100%”）。统一调整标签、控件和状态消息的宽度。',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        '作用于包含标签、控件和状态的 Field 容器的 StyleX 样式；containerClassName 与 containerStyle 以类名和内联样式作用于同一容器。没有 Field 容器时（InputGroup 内或 horizontal-labels FormLayout 中）不生效，并在开发环境发出警告。',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description: 'Field 容器的类名，作用目标同 containerXstyle。',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: 'Field 容器的内联样式，作用目标同 containerXstyle。',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        '作用于可见控件框（带边框、包含文本、图标和末端控件的元素，而非原生 input）的 StyleX 样式；controlClassName 与 controlStyle 以类名和内联样式作用于同一元素。本组件不接受根级 xstyle、className 和 style。',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: '可见控件框的类名，作用目标同 controlXstyle。',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description: '可见控件框的内联样式，作用目标同 controlXstyle。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-date-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
      {className: 'astryx-date-input-toggle-icon', states: ['state']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'text input w/ calendar popover for picking a date',
  usage: {
    description:
      'DateInput lets the user type or pick a date from a calendar popover. Use for scheduling, deadlines, booking dates, or any form field needing a calendar date.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the date input, the element that is focused and announced. A DOM handler runs after DateInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Provide clear labels + descriptions so users understand what date is expected.',
      },
      {
        guidance: true,
        description:
          'Use min, max, and dateConstraints to restrict selectable dates to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Use hasClear when the date is optional so the user can reset it.',
      },
      {
        guidance: true,
        description:
          'Show a loading state with changeAction when the date triggers a server-side save.',
      },
      {
        guidance: true,
        description:
          'On a fine pointer the field follows the WAI-ARIA combobox pattern with a dialog popup, as in the APG date picker combobox: ArrowDown or Alt+ArrowDown opens the calendar, and Escape closes it and returns focus to the field.',
      },
      {
        guidance: true,
        description:
          'Use inside InputGroup for a short static prefix or suffix, such as a due-date hint.',
      },
      {
        guidance: false,
        description:
          'Use a DateInput for free-form text that does not represent a calendar date.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the field purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Rely on the calendar alone; the text input lets users type dates directly, which is faster for known dates.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
  },
  propDescriptions: {
    label: 'label text',
    isLabelHidden: 'visually hide label',
    description: 'helper text below label',
    isOptional: 'show "(optional)" indicator',
    isRequired: 'mark field required',
    isDisabled: 'disable input+calendar',
    disabledMessage:
      "reason shown in a tooltip on hover/focus when disabled; describes the field's focusable controls",
    value: 'selected date YYYY-MM-DD',
    onChange: 'callback on date change',
    changeAction: 'async action after onChange; drives optimistic UI',
    isLoading:
      'loading state; stays focusable w/ aria-busy + spinner; blocks typing, picking, clearing',
    min: 'min selectable date (YYYY-MM-DD)',
    max: 'max selectable date (YYYY-MM-DD)',
    dateConstraints: 'custom constraint fns to disable specific dates',
    placeholder: 'placeholder text in input',
    size: 'input control size',
    status: 'error/warning/success status w/ message',
    statusVariant:
      'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    labelTooltip: 'tooltip text via info icon at label end',
    hasClear: 'Shows clear button when date is set. Clears value on click.',
    numberOfMonths: 'months shown simultaneously in calendar popover',
    weekStartsOn:
      'first day of week in calendar (0=Sunday, or name e.g. "mon")',
    format:
      "committed-value display: 'date_long' (default, March 21, 2026), 'date' (Mar 21, 2026), 'date_weekday' (Wed, Mar 21, 2026), 'system_date' (2026-03-21), or (iso)=>string; reuses Timestamp vocabulary. Committed value only, not while typing.",
    presentation:
      "which surface draws the picker: 'adaptive-native' (default) = Astryx popover on fine, browser/OS on coarse w/ Astryx fallbacks; 'native' = browser/OS always, no fallback; 'adaptive-bottom-sheet' = popover fine / Astryx sheet coarse; 'popover'/'bottom-sheet' force Astryx. every value opens a picker (no text-only value; that is TimeInput's). use non-native for weekStartsOn/numberOfMonths/dateConstraints.",
    nativePicker:
      "deprecated, use presentation: 'touch'='adaptive-native', 'always'='native', 'never'='adaptive-bottom-sheet'. still works as released; presentation wins if both set.",
    containerXstyle:
      'Field box (label+control+status); also containerClassName/containerStyle. no effect in InputGroup or horizontal-labels FormLayout',
    containerClassName:
      'class name for the Field box; same target as containerXstyle',
    containerStyle:
      'inline styles for the Field box; same target as containerXstyle',
    controlXstyle:
      'visual control box (border/bg/icons), never the native input; also controlClassName/controlStyle. no root xstyle/className/style',
    controlClassName:
      'class name for the visual control box; same target as controlXstyle',
    controlStyle:
      'inline styles for the visual control box; same target as controlXstyle',
  },
};
