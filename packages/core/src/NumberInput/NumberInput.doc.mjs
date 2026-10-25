// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'NumberInput',
  displayName: 'Number Input',
  category: 'Form Controls',
  keywords: [
    'numberinput',
    'numberfield',
    'stepper',
    'spinner',
    'counter',
    'increment',
    'decrement',
    'quantity',
    'numberpicker',
  ],
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Label text for the input (always rendered for accessibility).',
      required: true,
    },
    {
      name: 'value',
      type: 'number | null | undefined',
      description: 'Current value of the input.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: number) => void',
      description:
        'Callback fired when a valid text edit commits on blur or Enter, or when a step or clear control changes the value.',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size variant.',
      default: "'md'",
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hide the label (still accessible to screen readers).',
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
        'Whether the field is optional (mutually exclusive with isRequired).',
    },
    {
      name: 'onKeyDown',
      type: '(e: KeyboardEvent<HTMLInputElement>) => void',
      description: 'Callback fired on keydown events on the input.',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        'Whether the field is required (mutually exclusive with isOptional).',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the input is disabled.',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Makes the input read-only: the value is shown at full opacity and still submits with the form, but cannot be edited. Unlike isDisabled, a read-only input is not dimmed and keeps its form value. Stepping is off in every form while read-only: arrow keys, the wheel, and the number steppers. isDisabled takes precedence when both are set.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled NumberInput in Tooltip.',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        'Tooltip text to display in an info icon at the end of the label.',
    },
    {
      name: 'startIcon',
      type: 'IconType',
      description:
        'Icon to display at the start of the input. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'labelIcon',
      type: 'IconType',
      description:
        'Icon to display before the label text. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description: 'Validation status with optional message.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip hides the message box and surfaces it in a tooltip on the status icon.',
      default: "'attached'",
    },
    {
      name: 'min',
      type: 'number | null',
      description:
        'Minimum value allowed. A smaller entry commits at this value on blur or Enter.',
    },
    {
      name: 'max',
      type: 'number | null',
      description:
        'Maximum value allowed. A larger entry commits at this value on blur or Enter.',
    },
    {
      name: 'step',
      type: 'number | null',
      description: 'Step increment for the input.',
      default: '1',
    },
    {
      name: 'formatValue',
      type: '(value: number) => string',
      description:
        'Formats the committed value while the input is not focused. The raw numeric value is shown on focus for editing and the formatted value is exposed through aria-valuetext.',
    },
    {
      name: 'isWheelEnabled',
      type: 'boolean',
      description:
        'Whether scrolling the wheel over the focused input steps the value. Disable this when page scrolling should always take priority.',
      default: 'true',
    },
    {
      name: 'hasNumberSteppers',
      type: 'boolean',
      description:
        'Shows increment and decrement buttons at the end of the input.',
      default: 'false',
    },
    {
      name: 'units',
      type: 'string | null',
      description:
        'Units text to display at the end of the input (e.g., "%" or "GB").',
    },
    {
      name: 'isIntegerOnly',
      type: 'boolean',
      description: 'Only allow integer values (no floating point).',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows a clear (\u00d7) button when the input has a value. When true, the onChange callback also accepts null to signal the user cleared the input.',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description: 'HTML name attribute for form submissions.',
    },
    {
      name: 'autoComplete',
      type: 'string',
      description: 'HTML autocomplete attribute.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: 'Whether to focus the input on mount.',
    },
    {
      name: 'onFocus',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: 'Callback fired when the input receives focus.',
    },
    {
      name: 'onBlur',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: 'Callback fired when the input loses focus.',
    },
    {
      name: 'onEnter',
      type: '() => void',
      description: 'Callback fired when the user presses the Enter key.',
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
      description: 'Class name for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: 'Inline styles for the field container. Same targeting as `containerXstyle`.',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the visual control box: the element that paints the border and background and holds icons and end controls. Never the native input.',
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
  theming: {
    targets: [
      {
        className: 'astryx-number-input',
        visualProps: ['size', 'status'],
        states: ['disabled', 'readonly'],
      },
    ],
    derived: [
      // `padding` in any spelling — the shorthand, `paddingBlock`, or a lone
      // `paddingBlockStart` — is parsed by the shared container expansion and
      // emitted as normalized per-side `--astryx-number-input-padding-*`
      // tokens. The wrapper and the number-stepper column both read those, so
      // the column stays flush with the field edges under a themed padding.
      {property: 'padding', expand: 'container'},
      // Scoped to this component's own subtree: the stepper column's outer
      // corners follow the field radius, so a themed `number-input`
      // borderRadius has to reach the var the column reads, not just the
      // wrapper's own `border-radius`.
      {property: 'borderRadius', vars: ['--_field-radius']},
    ],
  },
  usage: {
    description:
      'A form input for numeric values with built-in validation, min/max constraints, and step controls. Use NumberInput for quantities, measurements, percentages, and similar inputs.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Let people paste formatted numbers: a pasted 1,234,234,234 is read under the field's locale and commits as 1234234234 on blur. Typing is never intercepted.",
      },
      {
        guidance: true,
        description:
          'Set min, max, and step to guide users toward valid values.',
      },
      {
        guidance: true,
        description:
          'Show units (e.g. "%" or "GB") so users know what the number represents.',
      },
      {
        guidance: true,
        description:
          'Set isWheelEnabled={false} when the input appears in a scrolling surface where wheel gestures should always scroll the page.',
      },
      {
        guidance: false,
        description:
          'Use NumberInput for free-form text that happens to contain numbers; use TextInput instead.',
      },
      {
        guidance: false,
        description: 'Set both isOptional and isRequired on the same field.',
      },
      {
        guidance: false,
        description:
          "Wrap a disabled NumberInput in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself.",
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description: 'The label for the number input.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Additional description text below the label.',
      },
      {
        name: 'Icon',
        required: false,
        description: 'An optional icon within the input.',
      },
      {
        name: 'Placeholder',
        required: false,
        description: 'Placeholder text shown when the input is empty.',
      },
      {
        name: 'Number steppers',
        required: false,
        description:
          'Optional buttons that increment or decrement by the configured step.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'NumberInput',
  displayName: 'Number Input',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '输入框的标签文本（始终渲染以确保无障碍访问）。',
      required: true,
    },
    {
      name: 'value',
      type: 'number | null | undefined',
      description: '输入框的当前值。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: number) => void',
      description:
        '有效文本编辑在失焦或按 Enter 时提交；步进或清除控件更改值时也会触发回调。',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '尺寸变体。',
      default: "'md'",
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '视觉隐藏标签（屏幕阅读器仍可访问）。',
    },
    {
      name: 'description',
      type: 'string',
      description: '显示在标签和输入框之间的描述文本。',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '字段是否可选（与 isRequired 互斥）。',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: '字段是否必填（与 isOptional 互斥）。',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '输入框是否禁用。',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        '将输入框设为只读：值以完整不透明度显示并仍随表单提交，但无法编辑。与 isDisabled 不同，只读输入框不会变暗，并保留其表单值。只读时所有步进方式均被禁用：方向键、滚轮和步进按钮。同时设置时 isDisabled 优先。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明输入框被禁用的原因。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示工具提示，并通过 aria-disabled 保持输入框可聚焦（字段变为只读）。请使用此属性，而不是用 Tooltip 包裹已禁用的 NumberInput。',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '占位符文本。',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description: '在标签末尾的信息图标中显示的工具提示文本。',
    },
    {
      name: 'startIcon',
      type: 'IconType',
      description: '显示在输入框起始位置的图标。',
    },
    {
      name: 'labelIcon',
      type: 'IconType',
      description: '显示在标签文本前的图标。',
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description: '带可选消息的验证状态。',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        '状态消息相对于输入框的放置方式。attached 直接叠加在输入框下方（带边框处理）；detached 作为独立元素浮于下方并留有间距；tooltip 隐藏消息框，并在状态图标上以提示气泡形式显示。',
      default: "'attached'",
    },
    {
      name: 'min',
      type: 'number | null',
      description: '允许的最小值。更小的输入会在失焦或按 Enter 时提交为该值。',
    },
    {
      name: 'max',
      type: 'number | null',
      description: '允许的最大值。更大的输入会在失焦或按 Enter 时提交为该值。',
    },
    {
      name: 'step',
      type: 'number | null',
      description: '输入框的步进增量。',
      default: '1',
    },
    {
      name: 'formatValue',
      type: '(value: number) => string',
      description:
        '输入框未聚焦时格式化已提交的值。聚焦编辑时显示原始数值，并通过 aria-valuetext 提供格式化值。',
    },
    {
      name: 'isWheelEnabled',
      type: 'boolean',
      description:
        '是否允许在已聚焦的输入框上滚动滚轮来步进数值。当页面滚动应始终优先时请禁用。',
      default: 'true',
    },
    {
      name: 'hasNumberSteppers',
      type: 'boolean',
      description: '是否在输入框末尾显示递增和递减按钮。',
      default: 'false',
    },
    {
      name: 'units',
      type: 'string | null',
      description: '在输入框末尾显示的单位文本（例如"%"或"GB"）。',
    },
    {
      name: 'isIntegerOnly',
      type: 'boolean',
      description: '仅允许整数值（不允许浮点数）。',
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        '输入有值时显示清除 (×) 按鈕。启用后， onChange 回调还接受 null 表示用户已清空输入。',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description: '用于表单提交的 HTML name 属性。',
    },
    {
      name: 'autoComplete',
      type: 'string',
      description: 'HTML autocomplete 属性。',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: '是否在挂载时聚焦输入框。',
    },
    {
      name: 'onFocus',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: '输入框获得焦点时触发的回调。',
    },
    {
      name: 'onBlur',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: '输入框失去焦点时触发的回调。',
    },
    {
      name: 'onEnter',
      type: '() => void',
      description: '用户按下 Enter 键时触发的回调。',
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        '字段容器（标签、控件和状态整体）的 StyleX 样式。在 InputGroup 内（请改为设置 InputGroup 的样式）或 `horizontal-labels` FormLayout 中无效。不接受根级 `xstyle`、`className` 和 `style`。',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description: '字段容器的类名，作用目标同 `containerXstyle`。',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: '字段容器的内联样式，作用目标同 `containerXstyle`。',
    },
    {
      name: 'controlXstyle',
      type: 'StyleXStyles',
      description:
        '可视控件框的 StyleX 样式：绘制边框和背景并包含图标与尾部控件的元素，而非原生输入元素。',
    },
    {
      name: 'controlClassName',
      type: 'string',
      description: '可视控件框的类名。',
    },
    {
      name: 'controlStyle',
      type: 'CSSProperties',
      description: '可视控件框的内联样式。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-number-input',
        visualProps: ['size', 'status'],
        states: ['disabled', 'readonly'],
      },
    ],
    derived: [
      // 任何写法的 `padding`（简写、`paddingBlock`，或单独的
      // `paddingBlockStart`）都由共享的 container 展开解析，并输出为规范化的
      // 每侧 `--astryx-number-input-padding-*` 令牌。容器与数字步进器列都读取
      // 这些令牌，因此在主题化内边距下步进器仍与字段边缘齐平。
      {property: 'padding', expand: 'container'},
      // 作用域限于该组件自身的子树：步进器列的外角跟随字段圆角，因此主题化的
      // `number-input` borderRadius 必须传到步进器读取的变量，而不只是容器
      // 自身的 `border-radius`。
      {property: 'borderRadius', vars: ['--_field-radius']},
    ],
  },
  usage: {
    description:
      'A form input for numeric values with built-in validation, min/max constraints, and step controls. Use NumberInput for quantities, measurements, percentages, and similar inputs.',
    bestPractices: [
      {
        guidance: true,
        description:
          '可以直接粘贴带格式的数字：粘贴 1,234,234,234 会按字段所在区域设置解析，失去焦点时提交为 1234234234。输入过程中不会拦截按键。',
      },
      {
        guidance: true,
        description:
          'Set min, max, and step to guide users toward valid values.',
      },
      {
        guidance: true,
        description:
          'Show units (e.g. "%" or "GB") so users know what the number represents.',
      },
      {
        guidance: true,
        description:
          'Set isWheelEnabled={false} when the input appears in a scrolling surface where wheel gestures should always scroll the page.',
      },
      {
        guidance: false,
        description:
          'Use NumberInput for free-form text that happens to contain numbers; use TextInput instead.',
      },
      {
        guidance: false,
        description: 'Set both isOptional and isRequired on the same field.',
      },
      {
        guidance: false,
        description:
          "Wrap a disabled NumberInput in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself.",
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description: 'The label for the number input.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Additional description text below the label.',
      },
      {
        name: 'Icon',
        required: false,
        description: 'An optional icon within the input.',
      },
      {
        name: 'Placeholder',
        required: false,
        description: 'Placeholder text shown when the input is empty.',
      },
      {
        name: 'Number steppers',
        required: false,
        description:
          'Optional buttons that increment or decrement by the configured step.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Number input component for collecting numeric user input w/ validation.',
  usage: {
    description:
      'A form input for numeric values with built-in validation, min/max constraints, and step controls. Use NumberInput for quantities, measurements, percentages, and similar inputs.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Pasted formatted numbers parse: 1,234,234,234 commits as 1234234234 under the field's locale. Typing is never intercepted.",
      },
      {
        guidance: true,
        description:
          'Set min, max, and step to guide users toward valid values.',
      },
      {
        guidance: true,
        description:
          'Show units (e.g. "%" or "GB") so users know what the number represents.',
      },
      {
        guidance: true,
        description:
          'Set isWheelEnabled={false} when the input appears in a scrolling surface where wheel gestures should always scroll the page.',
      },
      {
        guidance: false,
        description:
          'Use NumberInput for free-form text that happens to contain numbers; use TextInput instead.',
      },
      {
        guidance: false,
        description: 'Set both isOptional and isRequired on the same field.',
      },
      {
        guidance: false,
        description:
          "Wrap a disabled NumberInput in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself.",
      },
    ],
    anatomy: [
      {
        name: 'Label',
        required: true,
        description: 'The label for the number input.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Additional description text below the label.',
      },
      {
        name: 'Icon',
        required: false,
        description: 'An optional icon within the input.',
      },
      {
        name: 'Placeholder',
        required: false,
        description: 'Placeholder text shown when the input is empty.',
      },
      {
        name: 'Number steppers',
        required: false,
        description:
          'Optional buttons that increment or decrement by the configured step.',
      },
    ],
  },
  propDescriptions: {
    containerXstyle: 'StyleX styles for the field container; no effect in InputGroup or horizontal-labels FormLayout. No root xstyle/className/style.',
    containerClassName: 'Class name for the field container.',
    containerStyle: 'Inline styles for the field container.',
    controlXstyle: 'StyleX styles for the visual control box (border, background, icons); not the native input.',
    controlClassName: 'Class name for the visual control box.',
    controlStyle: 'Inline styles for the visual control box.',
    label: 'Label text (always rendered for accessibility).',
    value: 'Current input value.',
    onChange:
      'Callback when a valid text edit commits on blur/Enter, or a step/clear control changes the value.',
    size: 'Size variant.',
    isLabelHidden: 'Visually hide label (still accessible to screen readers).',
    description: 'Text between label + input.',
    isOptional: 'Field optional (mutually exclusive w/ isRequired).',
    isRequired: 'Field required (mutually exclusive w/ isOptional).',
    isDisabled: 'Input disabled.',
    isReadOnly:
      'Read-only: value visible + still submits, but not editable. Unlike isDisabled: not dimmed.',
    disabledMessage:
      'Explains why input is disabled. With isDisabled, shows tooltip on hover/focus + keeps input focusable via aria-disabled (field becomes read-only). Use instead of wrapping a disabled NumberInput in Tooltip.',
    placeholder: 'Placeholder text.',
    labelTooltip: 'Tooltip text in info icon at label end.',
    startIcon: 'Icon at input start.',
    labelIcon: 'Icon before label text.',
    status: 'Validation status w/ optional message.',
    statusVariant:
      'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    min: 'Minimum value allowed.',
    max: 'Maximum value allowed.',
    step: 'Step increment.',
    formatValue:
      'Formats committed value at rest; raw number is shown while editing.',
    isWheelEnabled:
      'Allow focused wheel gestures to step value. Defaults to true.',
    hasNumberSteppers: 'Show increment + decrement buttons. Defaults to false.',
    units: 'Units suffix (e.g. "%" or "GB").',
    isIntegerOnly: 'Only allow integer values.',
    hasClear:
      'Shows clear button when input has value. onChange also accepts null on clear.',
    htmlName: 'HTML name for form submissions.',
    autoComplete: 'HTML autocomplete attribute.',
    hasAutoFocus: 'Focus input on mount.',
    onFocus: 'Callback on focus.',
    onBlur: 'Callback on blur.',
    onEnter: 'Callback on Enter key.',
  },
};
