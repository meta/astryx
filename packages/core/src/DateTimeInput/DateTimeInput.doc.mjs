// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DateTimeInput',
  displayName: 'Date Time Input',
  group: 'DateInput',
  category: 'Form Controls',
  keywords: [
    'datetimepicker',
    'datetime',
    'datepicker',
    'timepicker',
    'calendar',
    'schedule',
    'event',
    'deadline',
    'timestamp',
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
        'Disable the input and picker. The fields stay focusable and expose `aria-disabled`; typing and opening are blocked.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and describes the fields (activation stays blocked). Use this instead of wrapping a disabled DateTimeInput in Tooltip.',
    },
    {
      name: 'value',
      type: 'ISODateTimeString',
      description:
        'Selected datetime in ISO 8601 format (YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS).',
    },
    {
      name: 'onChange',
      type: '(value: ISODateTimeString | undefined) => void',
      description: 'Callback invoked when the selected datetime changes.',
      required: true,
    },
    {
      name: 'changeAction',
      type: '(value: ISODateTimeString | undefined) => void | Promise<void>',
      description:
        'Async action fired after onChange. Drives optimistic UI updates via useTransition.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Whether the input is in a loading state. Disables interaction and shows a spinner.',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISODateTimeString',
      description:
        'Minimum selectable datetime. Constrains both date and time selection.',
    },
    {
      name: 'max',
      type: 'ISODateTimeString',
      description:
        'Maximum selectable datetime. Constrains both date and time selection.',
    },
    {
      name: 'dateConstraints',
      type: 'Array<(date: Date) => boolean>',
      description:
        'Array of custom constraint functions that disable specific dates.',
    },
    {
      name: 'hasSeconds',
      type: 'boolean',
      description:
        "Include seconds in the time portion. Keeps Astryx's time field even when nativePicker selects native surfaces, because iOS has no seconds wheel.",
      default: 'false',
    },
    {
      name: 'hourFormat',
      type: "'12h' | '24h'",
      description:
        "Hour display format. '12h' shows the locale's day period; '24h' uses 24-hour notation. When unset, follows the InternationalizationProvider locale's hour cycle (en-US 12-hour, en-GB 24-hour); a person's own preference rides on the locale tag (e.g. 'en-US-u-hc-h23').",
      default: "the locale's hour cycle",
    },
    {
      name: 'timeIncrement',
      type: '1 | 5 | 10 | 15 | 30',
      description:
        "Minute step for arrow keys in Astryx's typed time field. A non-default value keeps the Astryx time field in nativePicker modes because iOS treats native step as validation, not picker cadence. Ignored by the Astryx touch sheet, which uses wheels.",
      default: '1',
    },
    {
      name: 'timeOptionInterval',
      type: '5 | 10 | 15 | 30 | 60',
      description:
        "Minute cadence for the preset-time combobox on Astryx's fine-pointer time field. Setting it keeps that Astryx time field even in nativePicker modes because the OS picker has no equivalent preset list. The Astryx touch sheet uses wheels.",
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: 'Shows a clear button when a datetime value is set.',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description:
        'Placeholder text shown in the date portion when no date is selected.',
      default: "'Select a date'",
    },
    {
      name: 'timePlaceholder',
      type: 'string',
      description:
        'Placeholder text shown in the time portion when no time is selected. On touch, this appears in the closed time segment before a time is chosen.',
      default: "'Select a time'",
    },
    {
      name: 'timeLabel',
      type: 'string',
      description:
        'Accessible label for the time portion. Defaults to "{label} time" so it is tied to the field label and localizable.',
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
      name: 'labelTooltip',
      type: 'string',
      description:
        'Tooltip text displayed via an info icon at the end of the label.',
    },
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description:
        "Number of months displayed simultaneously in Astryx's pointer calendar popover. Ignored by native date controls and the mobile touch sheet, whose Date panel always shows one swipe-paged month at a time.",
      default: '1',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        'First day of week in Astryx calendars. A number (0 = Sunday to 6 = Saturday) or a three-letter day name. Ignored by native date controls.',
      default: '0',
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'",
      description:
        "Which surfaces draw the date and time pickers. 'adaptive-native' (the default) uses Astryx's typed fields and popovers on a fine pointer and browser/OS controls on a coarse pointer — with per-segment Astryx fallbacks: hasSeconds, non-default timeIncrement, or timeOptionInterval retain Astryx's time field because iOS cannot express them faithfully; 'native' always uses both browser/OS controls with no fallback; 'adaptive-bottom-sheet' uses popovers on a fine pointer and Astryx's coordinated bottom sheet on a coarse pointer; 'popover' and 'bottom-sheet' force that Astryx surface on every pointer. Every value opens pickers; typed-only fields are TimeInput's alone. Use a non-native presentation when numberOfMonths, weekStartsOn, or visible dateConstraints behavior matters. Constraints are enforced on commit; min/max are forwarded as hints. hourFormat formats the closed time, while the OS picker follows the user's locale.",
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
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the row that holds the bordered date and time segments with their icons and end controls, never a native input. controlClassName and controlStyle take a class name and inline styles for the same box. Replaces root xstyle, className, and style, which this component does not accept.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-date-time-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
      {
        className: 'astryx-date-time-input-date-segment',
        visualProps: ['size', 'status'],
      },
      {
        className: 'astryx-date-time-input-time-segment',
        visualProps: ['size', 'status'],
      },
      {className: 'astryx-date-time-input-toggle-icon', states: ['state']},
      {className: 'astryx-date-time-input-clock-icon'},
      {className: 'astryx-date-time-input-time-listbox'},
      {className: 'astryx-date-time-input-time-option'},
    ],
  },
  usage: {
    description:
      'DateTimeInput combines date and time selection in one field. With presentation="adaptive-native" (the default), mouse/trackpad devices use Astryx typed fields and popovers, while coarse-pointer devices use browser/OS date and time controls in the same two-segment field. presentation="native" uses both native controls on every pointer; presentation="adaptive-bottom-sheet" keeps Astryx\'s own surfaces — pointer fields on fine pointers and the coordinated Date/Time bottom sheet on coarse pointers; "popover" and "bottom-sheet" force one Astryx surface on every pointer. The closed segments stay side by side when at least 400px is available and wrap into full-width rows below 400px, independent of viewport width. Use it for scheduling, event creation, deadline setting, or any form field that needs a specific datetime.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the date input, the element that is focused and announced. A DOM handler runs after DateTimeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Provide clear labels and descriptions so users understand what datetime is expected.',
      },
      {
        guidance: true,
        description:
          'Use min and max to restrict selectable datetimes to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Use hasClear when the datetime is optional so the user can reset it.',
      },
      {
        guidance: true,
        description:
          "Leave hourFormat unset so the field follows the InternationalizationProvider locale's hour cycle (12-hour in en-US, 24-hour in en-GB or de-DE). Set it only when the field itself needs a fixed format, and carry a person's own 12/24-hour preference on the provider locale (e.g. 'en-US-u-hc-h23') rather than on each field.",
      },
      {
        guidance: false,
        description:
          'Use DateTimeInput when only a date is needed; use DateInput instead.',
      },
      {
        guidance: false,
        description:
          'Use DateTimeInput when only a time is needed; use TimeInput instead.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the field purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateTimeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description:
          'Text above the input describing what datetime is expected.',
      },
      {
        name: 'Segment row',
        required: true,
        description:
          'The unbordered layout row that holds the two bordered segments and wraps them when its container is narrow.',
      },
      {
        name: 'Date input',
        required: true,
        description:
          'A typed date field with calendar popover on the fine-pointer Astryx surface, a real input type=date in native modes, or a read-only segment opening the Astryx touch sheet under presentation="adaptive-bottom-sheet" on a coarse pointer.',
      },
      {
        name: 'Calendar icon',
        required: true,
        description:
          'A button that opens the active date surface: the platform picker, Astryx calendar popover, or Astryx touch sheet.',
      },
      {
        name: 'Date picker',
        required: false,
        description:
          'The browser/OS picker in native modes, an Astryx month-grid popover on a fine pointer, or the Date panel of the Astryx bottom sheet on a coarse pointer with presentation="adaptive-bottom-sheet".',
      },
      {
        name: 'Time input',
        required: true,
        description:
          'A real input type=time for the default minute-precision native mode, a text/combobox time field when seconds, custom increments, or preset options are requested, or a read-only segment opening accessible time wheels under presentation="adaptive-bottom-sheet" on a coarse pointer.',
      },
      {
        name: 'Clock icon',
        required: true,
        description:
          'The time glyph shown as a leading identifier on the Astryx pointer field and as the picker affordance in native and touch-sheet time segments.',
      },
      {
        name: 'Time options popover',
        required: false,
        description:
          "A list of preset times at the timeOptionInterval cadence. Setting the prop retains Astryx's text/combobox time field even when nativePicker otherwise selects native controls; the Astryx touch sheet uses wheels instead.",
      },
      {
        name: 'Time option',
        required: false,
        description:
          'One selectable preset time in the optional time-options popover.',
      },
      {
        name: 'Clear button',
        required: false,
        description: 'A × button that resets the datetime value.',
      },
      {
        name: 'Status message',
        required: false,
        description: 'An error, warning, or success message below the inputs.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'DateTimeInput',
  displayName: 'Date Time Input',
  usage: {
    description:
      'DateTimeInput combines date and time selection in one field. With presentation="adaptive-native" (the default), mouse/trackpad devices use Astryx typed fields and popovers, while coarse-pointer devices use browser/OS date and time controls in the same two-segment field. presentation="native" uses both native controls on every pointer; presentation="adaptive-bottom-sheet" keeps Astryx\'s own surfaces — pointer fields on fine pointers and the coordinated Date/Time bottom sheet on coarse pointers; "popover" and "bottom-sheet" force one Astryx surface on every pointer. The closed segments stay side by side when at least 400px is available and wrap into full-width rows below 400px, independent of viewport width. Use it for scheduling, event creation, deadline setting, or any form field that needs a specific datetime.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the date input, the element that is focused and announced. A DOM handler runs after DateTimeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Provide clear labels and descriptions so users understand what datetime is expected.',
      },
      {
        guidance: true,
        description:
          'Use min and max to restrict selectable datetimes to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Use hasClear when the datetime is optional so the user can reset it.',
      },
      {
        guidance: true,
        description:
          "Leave hourFormat unset so the field follows the InternationalizationProvider locale's hour cycle (12-hour in en-US, 24-hour in en-GB or de-DE). Set it only when the field itself needs a fixed format, and carry a person's own 12/24-hour preference on the provider locale (e.g. 'en-US-u-hc-h23') rather than on each field.",
      },
      {
        guidance: false,
        description:
          'Use DateTimeInput when only a date is needed; use DateInput instead.',
      },
      {
        guidance: false,
        description:
          'Use DateTimeInput when only a time is needed; use TimeInput instead.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the field purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateTimeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
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
      description: '禁用输入框和选择器。字段仍可聚焦并暴露 `aria-disabled`，但不能输入或打开选择器。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明输入框为何被禁用。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示提示，并描述日期和时间字段（仍阻止输入和激活）。请使用此属性，而不是用 Tooltip 包裹已禁用的 DateTimeInput。',
    },
    {
      name: 'value',
      type: 'ISODateTimeString',
      description: '选中的日期时间，ISO 8601 格式。',
    },
    {
      name: 'onChange',
      type: '(value: ISODateTimeString | undefined) => void',
      description: '选中日期时间变更时调用的回调。',
      required: true,
    },
    {
      name: 'changeAction',
      type: '(value: ISODateTimeString | undefined) => void | Promise<void>',
      description:
        '在 onChange 之后触发的异步操作。通过 useTransition 驱动乐观更新。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: '输入框是否处于加载状态。禁用交互并显示加载指示器。',
      default: 'false',
    },
    {
      name: 'min',
      type: 'ISODateTimeString',
      description: '可选择的最早日期时间。同时约束日期和时间选择。',
    },
    {
      name: 'max',
      type: 'ISODateTimeString',
      description: '可选择的最晚日期时间。同时约束日期和时间选择。',
    },
    {
      name: 'dateConstraints',
      type: 'Array<(date: Date) => boolean>',
      description: '自定义约束函数数组，用于禁用特定日期。',
    },
    {
      name: 'hasSeconds',
      type: 'boolean',
      description:
        '在时间部分包含秒。即使 nativePicker 选择原生界面，也会保留 Astryx 时间字段，因为 iOS 没有秒滚轮。',
      default: 'false',
    },
    {
      name: 'hourFormat',
      type: "'12h' | '24h'",
      description:
        "控制显示格式。'12h' 使用区域设置的上午/下午用语；'24h' 使用 24 小时制。未设置时遵循 InternationalizationProvider 区域设置的小时制（en-US 为 12 小时制，en-GB 为 24 小时制）；用户自己的偏好可通过区域标签传入（例如 'en-US-u-hc-h23'）。",
      default: '区域设置的小时制',
    },
    {
      name: 'timeIncrement',
      type: '1 | 5 | 10 | 15 | 30',
      description:
        'Astryx 可输入时间字段中箭头键的分钟步长。非默认值会在 nativePicker 模式下保留 Astryx 时间字段，因为 iOS 将原生 step 视为验证规则，而不是选择器步长。Astryx 触摸面板使用滚轮。',
      default: '1',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: '当有值时显示清除按钮。',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '日期部分未选择日期时显示的占位符文本。',
      default: "'Select a date'",
    },
    {
      name: 'timePlaceholder',
      type: 'string',
      description:
        '时间部分未选择时间时显示的占位符文本。在触摸设备上，这会显示在未选择时间的闭合时间段中。',
      default: "'Select a time'",
    },
    {
      name: 'timeLabel',
      type: 'string',
      description:
        '时间部分的无障碍标签。默认为“{label} time”，与字段标签关联且可本地化。',
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
      name: 'labelTooltip',
      type: 'string',
      description: '通过标签末尾的信息图标显示的提示文本。',
    },
    {
      name: 'numberOfMonths',
      type: '1 | 2',
      description:
        'Astryx 指针日历弹出层中同时显示的月份数量。原生日期控件和移动触摸面板会忽略此属性；触摸面板的日期部分一次显示一个可滑动月份。',
      default: '1',
    },
    {
      name: 'weekStartsOn',
      type: "0 | 1 | 2 | 3 | 4 | 5 | 6 | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'",
      description:
        'Astryx 日历中每周的起始日。可为数字（0=周日……6=周六）或三字母星期缩写。原生日期控件会忽略此属性。',
      default: '0',
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'native' | 'adaptive-bottom-sheet' | 'adaptive-native'",
      description:
        "选择由哪些界面绘制日期和时间选择器。'adaptive-native'（默认）在精细指针上使用 Astryx 文本字段与弹出层、在粗指针上使用浏览器/操作系统控件，并按段回退：hasSeconds、非默认 timeIncrement 或 timeOptionInterval 会保留 Astryx 时间字段；'native' 始终使用两个原生控件且不回退；'adaptive-bottom-sheet' 在精细指针上用弹出层、在粗指针上用 Astryx 协调底部面板；'popover' 与 'bottom-sheet' 在任何指针上强制使用对应 Astryx 界面。每个值都会打开选择器；仅文本字段的呈现只属于 TimeInput。需要 numberOfMonths、weekStartsOn 或可见 dateConstraints 行为时请使用非原生呈现。约束会在提交时执行，min/max 作为提示传给原生控件。hourFormat 格式化关闭状态的时间，而操作系统选择器遵循用户区域设置。",
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
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        '作用于包含标签、控件和状态的 Field 容器的 StyleX 样式；containerClassName 与 containerStyle 以类名和内联样式作用于同一容器。没有 Field 容器时（InputGroup 内或 horizontal-labels FormLayout 中）不生效，并在开发环境发出警告。',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        '作用于可见控件框（容纳带边框的日期与时间分段及其图标和末端控件的行，而非原生 input）的 StyleX 样式；controlClassName 与 controlStyle 以类名和内联样式作用于同一元素。本组件不接受根级 xstyle、className 和 style。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-date-time-input',
        visualProps: ['size', 'status'],
        states: ['disabled'],
      },
      {
        className: 'astryx-date-time-input-date-segment',
        visualProps: ['size', 'status'],
      },
      {
        className: 'astryx-date-time-input-time-segment',
        visualProps: ['size', 'status'],
      },
      {className: 'astryx-date-time-input-toggle-icon', states: ['state']},
      {className: 'astryx-date-time-input-clock-icon'},
      {className: 'astryx-date-time-input-time-listbox'},
      {className: 'astryx-date-time-input-time-option'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'combined date + time picker with calendar popover and time input',
  usage: {
    description:
      'DateTimeInput combines date and time selection. presentation="adaptive-native" (default) uses browser/OS date+time controls on coarse pointers and Astryx pointer fields on fine pointers; "native" uses both native controls everywhere; "adaptive-bottom-sheet" uses Astryx\'s coordinated bottom sheet on coarse pointers and pointer fields on fine pointers; "popover"/"bottom-sheet" force one Astryx surface everywhere. Closed segments stay side by side when at least 400px is available and wrap below 400px.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Base props such as ref, id, data-*, aria-*, and DOM event handlers go to the date input, the element that is focused and announced. A DOM handler runs after DateTimeInput's own handler for the same event and still receives events it handled (including ones it called preventDefault on), so it cannot cancel built-in behavior.",
      },
      {
        guidance: true,
        description:
          'Provide clear labels + descriptions so users understand what datetime is expected.',
      },
      {
        guidance: true,
        description:
          'Use min and max to restrict selectable datetimes to valid ranges.',
      },
      {
        guidance: true,
        description:
          'Use hasClear when the datetime is optional so the user can reset it.',
      },
      {
        guidance: true,
        description:
          "Leave hourFormat unset so the field follows the InternationalizationProvider locale's hour cycle (12-hour in en-US, 24-hour in en-GB or de-DE). Set it only when the field itself needs a fixed format, and carry a person's own 12/24-hour preference on the provider locale (e.g. 'en-US-u-hc-h23') rather than on each field.",
      },
      {
        guidance: false,
        description:
          'Use DateTimeInput when only a date is needed; use DateInput instead.',
      },
      {
        guidance: false,
        description:
          'Use DateTimeInput when only a time is needed; use TimeInput instead.',
      },
      {
        guidance: false,
        description:
          'Hide the label without surrounding context that makes the field purpose obvious.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled DateTimeInput in Tooltip to explain why it is disabled. Use the disabledMessage prop instead, which ties the reason to the field.',
      },
    ],
  },
  propDescriptions: {
    label: 'label text',
    isLabelHidden: 'visually hide label',
    description: 'helper text below label',
    isOptional: 'show "(optional)" indicator',
    isRequired: 'mark field required',
    isDisabled: 'disable input+picker',
    disabledMessage:
      'reason shown in a tooltip on hover/focus when disabled; describes the fields',
    value: 'selected datetime ISO 8601',
    onChange: 'callback on datetime change',
    changeAction: 'async action after onChange; drives optimistic UI',
    isLoading: 'loading state; disables interaction, shows spinner',
    min: 'min selectable datetime (ISO)',
    max: 'max selectable datetime (ISO)',
    dateConstraints: 'custom constraint fns to disable specific dates',
    hasSeconds:
      'include seconds; retains Astryx time field because iOS native picker has no seconds wheel',
    hourFormat:
      "display format. '12h' shows the locale's day period; '24h' uses 24-hour. Unset follows the provider locale's hour cycle (a -u-hc- tag carries a user preference)",
    timeIncrement:
      'minute step for Astryx typed field; non-default retains Astryx time field in native modes because iOS native step is validation-only',
    timeOptionInterval:
      'preset-time combobox cadence; setting it retains Astryx time field because native pickers have no equivalent list',
    hasClear: 'Shows clear button when datetime is set',
    placeholder: 'date-portion placeholder when empty',
    timePlaceholder:
      'time-portion placeholder when empty; shown on touch closed time segment',
    timeLabel:
      'accessible label for the time input; defaults to "{label} time"',
    size: 'input control size',
    status: 'error/warning/success status w/ message',
    labelTooltip: 'tooltip text via info icon at label end',
    numberOfMonths:
      'Astryx pointer-calendar months shown simultaneously; ignored by native date controls and the mobile touch sheet',
    weekStartsOn:
      'first day of week in Astryx calendars (0=Sunday, or name e.g. "mon"); ignored by native date controls',
    presentation:
      "date+time surfaces: 'adaptive-native' (default) = Astryx popovers fine / browser/OS coarse w/ per-segment fallbacks (seconds/timeIncrement/timeOptionInterval); 'native' = browser/OS always, no fallback; 'adaptive-bottom-sheet' = popovers fine / coordinated sheet coarse; 'popover'/'bottom-sheet' force Astryx. every value opens pickers (no typed-only value; that is TimeInput's).",
    nativePicker:
      "deprecated, use presentation: 'touch'='adaptive-native', 'always'='native', 'never'='adaptive-bottom-sheet'. still works as released; presentation wins if both set.",
    containerXstyle:
      'Field box (label+control+status); also containerClassName/containerStyle. no effect in InputGroup or horizontal-labels FormLayout',
    controlXstyle:
      'visual control box = the row holding the date and time segments, never a native input; also controlClassName/controlStyle. no root xstyle/className/style',
  },
};
