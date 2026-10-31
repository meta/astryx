// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TextInput',
  displayName: 'Text Input',
  category: 'Form Controls',
  keywords: ["textinput","textfield","input","search","clearable","prefix","suffix","adornment","validation"],
  props: [
    {
      name: 'type',
      type: "'text' | 'password' | 'email'",
      description:
        'The HTML input type.',
      default: "'text'",
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Label text for the input: always rendered for accessibility.',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: 'Current value of the input.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string, e: ChangeEvent<HTMLInputElement>) => void',
      description: 'Callback fired when the input value changes.',
    },
    {
      name: 'changeAction',
      type: '(value: string, e: ChangeEvent<HTMLInputElement>) => void | Promise<void>',
      description:
        'Async action fired after onChange (if not prevented). Triggers optimistic update and shows a loading spinner while pending.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size variant of the input.',
      default: "'md'",
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
        'Displays an "Optional" indicator next to the label. Mutually exclusive with isRequired.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        'Displays a "Required" indicator next to the label and sets aria-required. Mutually exclusive with isOptional.',
      default: 'false',
    },
    {
      name: 'onEnter',
      type: '() => void',
      description:
        'Callback fired when the user presses the Enter key. IME-safe: Enter used to commit a Japanese/Chinese/Korean conversion does not fire it.',
    },
    {
      name: 'onKeyDown',
      type: '(e: KeyboardEvent<HTMLInputElement>) => void',
      description: 'Callback fired on keydown events on the input.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables the input, preventing interaction and dimming the element.',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Makes the input read-only: the value is shown at full opacity and still submits with the form, but cannot be edited. Unlike isDisabled, a read-only input is not dimmed and keeps its form value. isDisabled takes precedence when both are set.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled TextInput in Tooltip, so the reason is attached to the field itself.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Puts the input in a loading state, showing a spinner and setting aria-busy.',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text shown when the input is empty.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        'Tooltip text displayed in an info icon at the end of the label.',
    },
    {
      name: 'startIcon',
      type: 'IconType',
      description:
        'SVG icon component displayed at the start of the input. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description:
        'Validation status: applies a colored border and status icon. If message is provided, displays a floating message below the input. Error type also sets aria-invalid.',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        'How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip hides the message box and surfaces it in a tooltip on the status icon.',
      default: "'attached'",
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description:
        'Shows a clear (\u00d7) button when the input has a value. Clicking it clears the value and returns focus to the input.',
      default: 'false',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: 'Automatically focuses the input on mount.',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        'The HTML name attribute for the input, useful for form submissions.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned. Without a width the field can shrink with its row, so a filter bar never overflows; use `<HStack wrap="wrap">` when the controls should move to a second line instead.',
    },
    {
      name: 'autoComplete',
      type: 'string',
      description:
        'The native autocomplete attribute, forwarded to the input unchanged. Does not affect the controlled value.',
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
      {className: 'astryx-text-input', visualProps: ['size', 'status'], states: ['disabled', 'readonly']},
    ],
  },
  usage: {
    description:
      'TextInput collects short-form text like names, emails, or search queries. Use it for single-line values where the expected input is brief. Pair it with validation status to guide users through required or formatted fields.',
    bestPractices: [
      {guidance: true, description: 'Always provide a visible label so users know what the field is for. Only hide the label when surrounding context makes it obvious, like a search bar with a magnifying-glass icon.'},
      {guidance: true, description: 'Use validation status with a message to explain what went wrong: "Email must include @" is better than just turning the border red.'},
      {guidance: true, description: 'Size the input to match the expected content length so users can gauge how much to type: small for zip codes, medium for names, large for URLs.'},
      {guidance: true, description: 'Add a clear button for search and filter inputs so users can quickly reset without selecting all text.'},
      {guidance: false, description: "Don't use placeholder text as a replacement for a label; placeholders disappear on focus and are not reliably read by screen readers."},
      {guidance: false, description: "Don't use TextInput for multi-line content like comments or descriptions; use TextArea instead."},
      {guidance: false, description: "Don't mark every field as required; only flag mandatory fields so users are not overwhelmed by validation errors."},
      {guidance: false, description: "Don't wrap a disabled TextInput in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself."},
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text that identifies the field. Always rendered for accessibility even when visually hidden.'},
      {name: 'Description', required: false, description: 'Helper text between the label and the input that provides additional context or formatting hints.'},
      {name: 'Start icon', required: false, description: 'A leading icon inside the input that hints at the expected content, like a magnifying glass for search.'},
      {name: 'Placeholder', required: false, description: 'Hint text shown when the input is empty. Disappears on focus.'},
      {name: 'Clear button', required: false, description: 'A trailing × button that resets the value and returns focus to the input.'},
      {name: 'Spinner', required: false, description: 'Loading indicator that appears during async actions like server-side validation.'},
      {name: 'Status icon', required: false, description: 'A trailing icon (error, warning, or success) that communicates validation state.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'TextInput',
  displayName: 'Text Input',
  props: [
    {
      name: 'type',
      type: "'text' | 'password' | 'email'",
      description: 'HTML 输入框类型。',
      default: "'text'",
    },
    {
      name: 'label',
      type: 'string',
      description:
        '输入框的标签文本：始终渲染以确保无障碍性。',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: '输入框的当前值。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string, e: ChangeEvent<HTMLInputElement>) => void',
      description: '输入框值变化时触发的回调。',
    },
    {
      name: 'changeAction',
      type: '(value: string, e: ChangeEvent<HTMLInputElement>) => void | Promise<void>',
      description:
        '在 onChange 之后（如果未被阻止）触发的异步操作。触发乐观更新并在挂起时显示加载旋转器。',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '输入框的尺寸变体。',
      default: "'md'",
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        '视觉上隐藏标签，同时保持屏幕阅读器的无障碍性。',
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
      description:
        '在标签旁显示"可选"指示器。与 isRequired 互斥。',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        '在标签旁显示"必填"指示器并设置 aria-required。与 isOptional 互斥。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        '禁用输入框，阻止交互并使元素变暗。',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        '将输入框设为只读：值以完整不透明度显示并仍随表单提交，但无法编辑。与 isDisabled 不同，只读输入框不会变暗，并保留其表单值。同时设置时 isDisabled 优先。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明输入框被禁用的原因。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示工具提示，并通过 aria-disabled 保持输入框可聚焦（字段变为只读）。请使用此属性，而不是用 Tooltip 包裹已禁用的 TextInput，以便把原因附加在字段本身上。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        '使输入框进入加载状态，显示旋转器并设置 aria-busy。',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '输入框为空时显示的占位符文本。',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        '在标签末尾的信息图标中显示的工具提示文本。',
    },
    {
      name: 'startIcon',
      type: 'IconType',
      description:
        '显示在输入框起始位置的 SVG 图标组件（例如来自 heroicons 或 lucide）。',
    },
    {
      name: 'status',
      type: "{type: 'error' | 'warning' | 'success', message?: string}",
      description:
        '验证状态：应用彩色边框和状态图标。如果提供了 message，在输入框下方显示浮动消息。错误类型还会设置 aria-invalid。',
    },
    {
      name: 'statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description:
        '状态消息相对于输入框的放置方式。attached 直接叠加在输入框下方（带边框处理）；detached 作为独立元素浮于下方并留有间距；tooltip 隐藏消息框，并在状态图标上以提示气泡形式显示。',
      default: "'attached'",
    },
    {
      name: 'hasClear',
      type: 'boolean',
      description: '输入有值时显示清除 (×) 按鈕。点击后清空值并将焦点返回输入框。',
      default: 'false',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: '挂载时自动聚焦输入框。',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        '输入框的 HTML name 属性，用于表单提交。',
    },
    {
      name: 'autoComplete',
      type: 'string',
      description:
        '原生 autocomplete 属性，原样转发给输入框。不影响受控的值。',
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
      {className: 'astryx-text-input', visualProps: ['size', 'status'], states: ['disabled', 'readonly']},
    ],
  },
  usage: {
    description:
      'TextInput collects short-form text like names, emails, or search queries. Use it for single-line values where the expected input is brief. Pair it with validation status to guide users through required or formatted fields.',
    bestPractices: [
      {guidance: true, description: 'Always provide a visible label so users know what the field is for. Only hide the label when surrounding context makes it obvious, like a search bar with a magnifying-glass icon.'},
      {guidance: true, description: 'Use validation status with a message to explain what went wrong: "Email must include @" is better than just turning the border red.'},
      {guidance: true, description: 'Size the input to match the expected content length so users can gauge how much to type: small for zip codes, medium for names, large for URLs.'},
      {guidance: true, description: 'Add a clear button for search and filter inputs so users can quickly reset without selecting all text.'},
      {guidance: false, description: "Don't use placeholder text as a replacement for a label; placeholders disappear on focus and are not reliably read by screen readers."},
      {guidance: false, description: "Don't use TextInput for multi-line content like comments or descriptions; use TextArea instead."},
      {guidance: false, description: "Don't mark every field as required; only flag mandatory fields so users are not overwhelmed by validation errors."},
      {guidance: false, description: "Don't wrap a disabled TextInput in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself."},
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text that identifies the field. Always rendered for accessibility even when visually hidden.'},
      {name: 'Description', required: false, description: 'Helper text between the label and the input that provides additional context or formatting hints.'},
      {name: 'Start icon', required: false, description: 'A leading icon inside the input that hints at the expected content, like a magnifying glass for search.'},
      {name: 'Placeholder', required: false, description: 'Hint text shown when the input is empty. Disappears on focus.'},
      {name: 'Clear button', required: false, description: 'A trailing × button that resets the value and returns focus to the input.'},
      {name: 'Spinner', required: false, description: 'Loading indicator that appears during async actions like server-side validation.'},
      {name: 'Status icon', required: false, description: 'A trailing icon (error, warning, or success) that communicates validation state.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Text input for collecting user text w/ label, description, validation status, optional/required indicators.',
  usage: {
    description:
      'TextInput collects short-form text like names, emails, or search queries. Use it for single-line values where the expected input is brief. Pair it with validation status to guide users through required or formatted fields.',
    bestPractices: [
      {guidance: true, description: 'Always provide a visible label so users know what the field is for. Only hide the label when surrounding context makes it obvious, like a search bar with a magnifying-glass icon.'},
      {guidance: true, description: 'Use validation status with a message to explain what went wrong: "Email must include @" is better than just turning the border red.'},
      {guidance: true, description: 'Size the input to match the expected content length so users can gauge how much to type: small for zip codes, medium for names, large for URLs.'},
      {guidance: true, description: 'Add a clear button for search and filter inputs so users can quickly reset without selecting all text.'},
      {guidance: false, description: "Don't use placeholder text as a replacement for a label; placeholders disappear on focus and are not reliably read by screen readers."},
      {guidance: false, description: "Don't use TextInput for multi-line content like comments or descriptions; use TextArea instead."},
      {guidance: false, description: "Don't mark every field as required; only flag mandatory fields so users are not overwhelmed by validation errors."},
      {guidance: false, description: "Don't wrap a disabled TextInput in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself."},
    ],
    anatomy: [
      {name: 'Label', required: true, description: 'Text that identifies the field. Always rendered for accessibility even when visually hidden.'},
      {name: 'Description', required: false, description: 'Helper text between the label and the input that provides additional context or formatting hints.'},
      {name: 'Start icon', required: false, description: 'A leading icon inside the input that hints at the expected content, like a magnifying glass for search.'},
      {name: 'Placeholder', required: false, description: 'Hint text shown when the input is empty. Disappears on focus.'},
      {name: 'Clear button', required: false, description: 'A trailing × button that resets the value and returns focus to the input.'},
      {name: 'Spinner', required: false, description: 'Loading indicator that appears during async actions like server-side validation.'},
      {name: 'Status icon', required: false, description: 'A trailing icon (error, warning, or success) that communicates validation state.'},
    ],
  },
  propDescriptions: {
    containerXstyle: 'StyleX styles for the field container; no effect in InputGroup or horizontal-labels FormLayout. No root xstyle/className/style.',
    containerClassName: 'Class name for the field container.',
    containerStyle: 'Inline styles for the field container.',
    controlXstyle: 'StyleX styles for the visual control box (border, background, icons); not the native input.',
    controlClassName: 'Class name for the visual control box.',
    controlStyle: 'Inline styles for the visual control box.',
    type: 'HTML input type.',
    label: 'Label text for input; always rendered for a11y.',
    value: 'Current input value.',
    onChange: 'Fired on input value change.',
    changeAction: 'Async action after onChange (if not prevented). Triggers optimistic update+spinner while pending.',
    size: 'Size variant of input.',
    isLabelHidden: 'Visually hides label; keeps screen reader access.',
    description: 'Description text between label+input.',
    isOptional: 'Shows "Optional" indicator. Mutually exclusive w/ isRequired.',
    isRequired: 'Shows "Required" indicator+sets aria-required. Mutually exclusive w/ isOptional.',
    isDisabled: 'Disables input, prevents interaction, dims element.',
    isReadOnly:
      'Read-only: value visible + still submits, but not editable. Unlike isDisabled: not dimmed.',
    disabledMessage:
      'Explains why input is disabled. With isDisabled, shows tooltip on hover/focus + keeps input focusable via aria-disabled (field becomes read-only). Use instead of wrapping a disabled TextInput in Tooltip.',
    isLoading: 'Loading state w/ spinner+aria-busy.',
    placeholder: 'Placeholder when input empty.',
    labelTooltip: 'Tooltip in info icon at label end.',
    startIcon: 'SVG icon at input start (e.g. heroicons or lucide).',
    status: 'Validation status; colored border+icon. Message floats below. Error sets aria-invalid.',
    statusVariant: 'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    hasClear: 'Shows clear button when input has value. Clears value on click.',
    hasAutoFocus: 'Auto-focus input on mount.',
    htmlName: 'HTML name attr for form submissions.',
    autoComplete: 'Native autocomplete attr, forwarded unchanged. Does not affect the controlled value.',
  },
};
