// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TimeInput',
  displayName: 'Time Input',
  category: 'Form Controls',
  keywords: [
    'timeinput',
    'timepicker',
    'time',
    'clock',
    'hour',
    'minute',
    'ampm',
    'timeselect',
    'timefield',
    'schedule',
  ],

  usage: {
    description:
      "TimeInput uses a browser/OS time picker on coarse pointers by default and Astryx's typed field on fine pointers. It converts values to a standard format and supports arrow-key adjustment on the typed surface. Use it in forms, scheduling flows, or any interface where users need to select a specific time.",
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the time input, the element that is focused and announced. A DOM handler runs after TimeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          "Leave hourFormat unset so the field follows the InternationalizationProvider locale's hour cycle (12-hour in en-US, 24-hour in en-GB or de-DE). Set it only when the field itself needs a fixed format, and carry a person's own 12/24-hour preference on the provider locale (e.g. 'en-US-u-hc-h23') rather than on each field.",
      },
      {
        guidance: true,
        description:
          'Set min and max constraints when the context has a valid range, like business hours or event windows, so users cannot submit an out-of-bounds time.',
      },
      {
        guidance: true,
        description:
          'Provide a description or placeholder that hints at the expected format or purpose, like "Business hours: 9 AM \u2013 5 PM".',
      },
      {
        guidance: true,
        description:
          'Use the status prop to surface validation errors inline: show a message like "Time must be during business hours" so users know exactly what to fix.',
      },
      {
        guidance: true,
        description:
          'Enable hasClear when the field is optional, so users can remove a previously selected time.',
      },
      {
        guidance: true,
        description:
          'Place TimeInput inside InputGroup when the time needs a single-line prefix or suffix addon, like a start/end label or timezone marker.',
      },
      {
        guidance: false,
        description:
          "Don't use TimeInput for combined date-and-time selection; pair it with a separate DateInput instead.",
      },
      {
        guidance: false,
        description:
          "Don't hide the label; even when space is tight, keep the label visible or provide a description so the purpose is clear.",
      },
      {
        guidance: false,
        description:
          'Wrap a disabled TimeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
    anatomy: [
      {
        name: 'Clock icon',
        required: false,
        description:
          'A leading clock icon that identifies the field and opens the browser/OS picker in native mode.',
      },
      {
        name: 'Time control',
        required: true,
        description:
          'A real input type=time in native modes, or Astryx\'s editable text field for fine pointers, presentation="text-input", seconds, and custom increments.',
      },
      {
        name: 'Clear button',
        required: false,
        description:
          'A trailing button to reset the value, shown when hasClear is true and a value is set.',
      },
      {
        name: 'Status icon',
        required: false,
        description:
          'A trailing icon indicating error, warning, or success state.',
      },
      {
        name: 'Spinner',
        required: false,
        description:
          'Replaces trailing content during loading to show an async action is in progress.',
      },
    ],
  },

  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label text for the input (required for accessibility).',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hides the label while keeping it accessible to screen readers.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text displayed between the label and input.',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        'Shows an "(optional)" indicator next to the label. Mutually exclusive with isRequired.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        'Marks the field as required and sets aria-required. Mutually exclusive with isOptional.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables the input and suppresses interactions. The input stays focusable and exposes `aria-disabled`.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the input (activation stays blocked). Use this instead of wrapping a disabled TimeInput in Tooltip.',
    },
    {
      name: 'value',
      type: 'ISOTimeString',
      description: 'Controlled time value in ISO format (HH:MM or HH:MM:SS).',
    },
    {
      name: 'onChange',
      type: '(value: ISOTimeString | undefined) => void',
      description:
        'Callback fired when the time changes. Receives undefined when the input is cleared.',
    },
    {
      name: 'changeAction',
      type: '(value: ISOTimeString | undefined) => void | Promise<void>',
      description:
        'Async action fired after onChange. Wrapped in a React transition to provide optimistic UI; triggers the loading spinner while pending.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: 'Puts the input into a loading state, displaying a spinner.',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISOTimeString',
      description:
        'Minimum selectable time in ISO format. Values outside the range are rejected.',
    },
    {
      name: 'max',
      type: 'ISOTimeString',
      description:
        'Maximum selectable time in ISO format. Values outside the range are rejected.',
    },
    {
      name: 'hasSeconds',
      type: 'boolean',
      description: 'Includes seconds in the time display and parsing.',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows a clear button when a value is set and the input is not disabled.',
      default: 'false',
    },
    {
      name: 'hourFormat',
      type: "'12h' | '24h'",
      description:
        "Controls the display format. '12h' shows the locale's day period (e.g. '2:30 PM', '오후 2:30'); '24h' uses 24-hour notation (e.g. '14:30'). When unset, follows the InternationalizationProvider locale's hour cycle: en-US reads 12-hour, en-GB and de-DE read 24-hour. To honor a person's own preference, pass it on the locale tag (e.g. 'en-US-u-hc-h23') rather than per field.",
      default: "the locale's hour cycle",
    },
    {
      name: 'increment',
      type: 'number',
      description:
        'Number of minutes to add or subtract when the user presses the up or down arrow key. Steps are whole minutes; a fractional value leaves the time unchanged.',
      default: '1',
    },
    {
      name: 'presentation',
      type: "'text-input' | 'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'",
      description:
        "Which surface selects the time. 'adaptive-native' (the default) uses Astryx's typed field on a fine pointer and the browser/OS input type=time on a coarse pointer — except hasSeconds or increment other than 1, which retain the typed field because iOS has no seconds wheel and treats step as validation rather than picker cadence; 'native' always uses the browser/OS control with no Astryx fallback; 'adaptive-bottom-sheet' uses the typed field on a fine pointer and Astryx's bottom-sheet time wheels on a coarse pointer; 'bottom-sheet' forces the wheels on every pointer; 'text-input' (like 'popover', which has no distinct TimeInput surface) keeps only the typed field. Native mode forwards min/max and enforces them on commit. hourFormat formats the closed value; the open OS picker follows the device locale.",
      default: "'adaptive-native'",
    },
    {
      name: 'nativePicker',
      type: "'touch' | 'always' | 'never'",
      description:
        "Deprecated: use presentation ('touch' = 'adaptive-native', 'always' = 'native', 'never' = 'text-input'). Still works exactly as released; presentation wins when both are set.",
      default: "'touch'",
    },
    {
      name: 'placeholder',
      type: 'string',
      description:
        'Placeholder text shown when no time is selected. When the input is focused and empty, a format hint overrides this text.',
      default: "'Select a time'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Controls the height of the input element.',
      default: "'md'",
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description:
        'Status indicator that colors the border and displays an icon. When a message is provided it is rendered below the input.',
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
        'Tooltip text rendered as an info icon at the end of the label row.',
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
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the bordered element that holds the text, icons, and end controls, never the native input. controlClassName and controlStyle take a class name and inline styles for the same box. Replaces root xstyle, className, and style, which this component does not accept.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-time-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'TimeInput',

  displayName: 'Time Input',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '输入框的标签文本（无障碍性所必需）。',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '视觉上隐藏标签，同时保持屏幕阅读器的无障碍性。',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: '显示在标签和输入框之间的描述文本。',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '在标签旁显示"（可选）"指示器。与 isRequired 互斥。',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: '将字段标记为必填并设置 aria-required。与 isOptional 互斥。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '禁用输入框并抑制交互。输入框仍可聚焦并暴露 `aria-disabled`。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明输入框为何被禁用。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示提示，并描述输入框（仍阻止输入和调整）。请使用此属性，而不是用 Tooltip 包裹已禁用的 TimeInput。',
    },
    {
      name: 'value',
      type: 'ISOTimeString',
      description: 'ISO 格式的受控时间值（HH:MM 或 HH:MM:SS）。',
    },
    {
      name: 'onChange',
      type: '(value: ISOTimeString | undefined) => void',
      description: '时间变化时触发的回调。输入被清除时接收 undefined。',
    },
    {
      name: 'changeAction',
      type: '(value: ISOTimeString | undefined) => void | Promise<void>',
      description:
        '在 onChange 之后触发的异步操作。包装在 React transition 中以提供乐观 UI；挂起时触发加载旋转器。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: '使输入框进入加载状态，显示旋转器。',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISOTimeString',
      description: 'ISO 格式的最小可选时间。超出范围的值将被拒绝。',
    },
    {
      name: 'max',
      type: 'ISOTimeString',
      description: 'ISO 格式的最大可选时间。超出范围的值将被拒绝。',
    },
    {
      name: 'hasSeconds',
      type: 'boolean',
      description: '在时间显示和解析中包含秒。',
      default: 'false',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: '当有值且输入框未被禁用时显示清除按钮。',
      default: 'false',
    },
    {
      name: 'hourFormat',
      type: "'12h' | '24h'",
      description:
        "控制显示格式。'12h' 使用区域设置的上午/下午用语（例如 '2:30 PM'、'오후 2:30'）；'24h' 使用 24 小时制（例如 '14:30'）。未设置时遵循 InternationalizationProvider 区域设置的小时制：en-US 为 12 小时制，en-GB 和 de-DE 为 24 小时制。要遵循用户自己的偏好，请在区域标签中传入（例如 'en-US-u-hc-h23'），而不是逐个字段设置。",
      default: '区域设置的小时制',
    },
    {
      name: 'increment',
      type: 'number',
      description:
        '用户按上或下方向键时增加或减少的分钟数。步长为整分钟；传入小数时时间保持不变。',
      default: '1',
    },
    {
      name: 'presentation',
      type: "'text-input' | 'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'",
      description:
        "选择时间所用的界面。'adaptive-native'（默认）在精细指针上使用 Astryx 文本字段、在粗指针上使用浏览器/操作系统 input type=time——但 hasSeconds 或 increment 不为 1 时保留文本字段；'native' 始终使用浏览器/操作系统控件且不回退；'adaptive-bottom-sheet' 在精细指针上用文本字段、在粗指针上用 Astryx 底部滚轮选择器；'bottom-sheet' 在任何指针上强制使用滚轮；'text-input'（与无独立界面的 'popover' 相同）只保留文本字段。原生模式会传递 min/max 并在提交时强制校验。hourFormat 控制关闭状态的显示；打开的系统选择器遵循设备区域设置。",
      default: "'adaptive-native'",
    },
    {
      name: 'nativePicker',
      type: "'touch' | 'always' | 'never'",
      description:
        "已弃用：请使用 presentation（'touch'='adaptive-native'、'always'='native'、'never'='text-input'）。仍按已发布行为工作；同时设置时以 presentation 为准。",
      default: "'touch'",
    },
    {
      name: 'placeholder',
      type: 'string',
      description:
        '未选择时间时显示的占位符文本。当输入框聚焦且为空时，格式提示会覆盖此文本。',
      default: "'Select a time'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '控制输入框元素的高度。',
      default: "'md'",
    },
    {
      name: 'status',
      type: "{type: 'warning' | 'error' | 'success', message?: string}",
      description:
        '为边框着色并显示图标的状态指示器。当提供消息时，消息渲染在输入框下方。',
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
      description: '在标签行末尾以信息图标形式渲染的工具提示文本。',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        '作用于包含标签、控件和状态的 Field 容器的 StyleX 样式；containerClassName 与 containerStyle 以类名和内联样式作用于同一容器。没有 Field 容器时（InputGroup 内或 horizontal-labels FormLayout 中）不生效，并在开发环境发出警告。',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        '作用于可见控件框（带边框、包含文本、图标和末端控件的元素，而非原生 input）的 StyleX 样式；controlClassName 与 controlStyle 以类名和内联样式作用于同一元素。本组件不接受根级 xstyle、className 和 style。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-time-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
    ],
  },
  usage: {
    description:
      'TimeInput 默认在粗指针设备上使用浏览器/操作系统的时间选择器，在精细指针设备上使用 Astryx 文本字段。它将时间转换为标准格式，并在文本字段界面支持方向键调整。适用于表单、排期流程和其他时间选择场景。',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the time input, the element that is focused and announced. A DOM handler runs after TimeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          "Leave hourFormat unset so the field follows the InternationalizationProvider locale's hour cycle (12-hour in en-US, 24-hour in en-GB or de-DE). Set it only when the field itself needs a fixed format, and carry a person's own 12/24-hour preference on the provider locale (e.g. 'en-US-u-hc-h23') rather than on each field.",
      },
      {
        guidance: true,
        description:
          'Set min and max constraints when the context has a valid range, like business hours or event windows, so users cannot submit an out-of-bounds time.',
      },
      {
        guidance: true,
        description:
          'Provide a description or placeholder that hints at the expected format or purpose, like "Business hours: 9 AM \u2013 5 PM".',
      },
      {
        guidance: true,
        description:
          'Use the status prop to surface validation errors inline: show a message like "Time must be during business hours" so users know exactly what to fix.',
      },
      {
        guidance: true,
        description:
          'Enable hasClear when the field is optional, so users can remove a previously selected time.',
      },
      {
        guidance: false,
        description:
          "Don't use TimeInput for combined date-and-time selection; pair it with a separate DateInput instead.",
      },
      {
        guidance: false,
        description:
          "Don't hide the label; even when space is tight, keep the label visible or provide a description so the purpose is clear.",
      },
      {
        guidance: false,
        description:
          'Wrap a disabled TimeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
    anatomy: [
      {
        name: 'Clock icon',
        required: false,
        description:
          '用于识别时间字段的前置时钟图标；在原生模式下也可打开浏览器/操作系统选择器。',
      },
      {
        name: 'Time control',
        required: true,
        description:
          '原生模式下使用真正的 input type=time；精细指针、presentation="text-input"、秒或自定义步进场景使用 Astryx 可编辑文本字段。',
      },
      {
        name: 'Clear button',
        required: false,
        description:
          'A trailing button to reset the value, shown when hasClear is true and a value is set.',
      },
      {
        name: 'Status icon',
        required: false,
        description:
          'A trailing icon indicating error, warning, or success state.',
      },
      {
        name: 'Spinner',
        required: false,
        description:
          'Replaces trailing content during loading to show an async action is in progress.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Time input with browser/OS picker on touch by default and Astryx typed-field fallbacks for seconds or custom increments.',
  usage: {
    description:
      'TimeInput uses a browser/OS picker on coarse pointers by default and Astryx typed entry on fine pointers. It standardizes values and supports arrow-key adjustment on the typed surface.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the time input, the element that is focused and announced. A DOM handler runs after TimeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          "Leave hourFormat unset to follow the provider locale's hour cycle; put a person's 12/24h preference on the locale tag (en-US-u-hc-h23), not on each field.",
      },
      {
        guidance: true,
        description:
          'Set min/max constraints for valid ranges like business hours.',
      },
      {
        guidance: true,
        description:
          'Provide description or placeholder hinting at expected format.',
      },
      {
        guidance: true,
        description: 'Use status prop for inline validation errors.',
      },
      {guidance: true, description: 'Enable hasClear for optional fields.'},
      {
        guidance: true,
        description:
          'Place inside InputGroup for a single-line prefix or suffix addon, like a label or timezone marker.',
      },
      {
        guidance: false,
        description:
          "Don't use for date-and-time; pair with DateInput instead.",
      },
      {
        guidance: false,
        description: "Don't hide the label; keep it visible for clarity.",
      },
      {
        guidance: false,
        description:
          "Don't wrap a disabled TimeInput in Tooltip; use the disabledMessage prop instead.",
      },
    ],
  },
  propDescriptions: {
    label: 'Label text (required for a11y).',
    isLabelHidden: 'Visually hides label; keeps screen reader access.',
    description: 'Description text between label+input.',
    isOptional:
      'Shows "(optional)" indicator. Mutually exclusive w/ isRequired.',
    isRequired:
      'Marks required+sets aria-required. Mutually exclusive w/ isOptional.',
    isDisabled: 'Disables input, suppresses interactions.',
    disabledMessage:
      'Reason shown in a tooltip on hover/focus when disabled; describes the input.',
    value: 'Controlled time in ISO format (HH:MM or HH:MM:SS).',
    onChange: 'Fired on time change. Receives undefined when cleared.',
    changeAction:
      'Async action after onChange in React transition; triggers spinner while pending.',
    isLoading: 'Loading state w/ spinner.',
    min: 'Min selectable time in ISO format. Out-of-range rejected.',
    max: 'Max selectable time in ISO format. Out-of-range rejected.',
    hasSeconds: 'Includes seconds in display+parsing.',
    hasClear: 'Shows clear button when value set+not disabled.',
    hourFormat:
      "Display format. '12h' shows the locale's day period; '24h' uses 24-hour notation. Unset follows the provider locale's hour cycle (a -u-hc- tag carries a user preference).",
    increment:
      'Minutes to add/subtract on arrow up/down. Whole minutes only; a fractional value leaves the time unchanged.',
    presentation:
      "picker surface: 'adaptive-native' (default) = typed field fine / browser/OS coarse (hasSeconds or increment!=1 retains typed); 'native' = browser/OS always, no fallback; 'adaptive-bottom-sheet' = typed fine / Astryx wheel sheet coarse; 'bottom-sheet' = sheet always; 'text-input'/'popover' = typed field only.",
    nativePicker:
      "deprecated, use presentation: 'touch'='adaptive-native', 'always'='native', 'never'='text-input'. still works as released; presentation wins if both set.",
    placeholder: 'Placeholder when empty. Focused+empty shows format hint.',
    size: 'Input element height.',
    status: 'Colored border+icon. Message rendered below input.',
    statusVariant:
      'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    labelTooltip: 'Tooltip as info icon at label row end.',
    containerXstyle:
      'Field box (label+control+status); also containerClassName/containerStyle. no effect in InputGroup or horizontal-labels FormLayout',
    controlXstyle:
      'visual control box (border/bg/icons), never the native input; also controlClassName/controlStyle. no root xstyle/className/style',
  },
};
