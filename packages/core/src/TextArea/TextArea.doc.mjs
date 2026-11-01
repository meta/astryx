// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Label',
    required: true,
    description: 'Text identifying the multi-line field.',
  },
  {
    name: 'Description',
    required: false,
    description: 'Helper text between the label and the input.',
  },
  {
    name: 'Input container',
    required: true,
    description: 'Painted boundary containing the text area and its overlays.',
  },
  {
    name: 'Text area',
    required: true,
    description: 'Multi-line control that displays and edits the value.',
  },
  {
    name: 'Placeholder',
    required: false,
    description: 'Hint text shown inside the empty text area.',
  },
  {
    name: 'Start icon',
    required: false,
    description:
      'Astryx Icon rendered at the start when startIcon is a semantic name or icon component.',
  },
  {
    name: 'Custom start content',
    required: false,
    description:
      'Caller-provided ReactNode rendered at the start instead of an Astryx Icon.',
  },
  {
    name: 'Spinner',
    required: false,
    description: 'Loading indicator shown at the end of the input container.',
  },
  {
    name: 'Status icon',
    required: false,
    description: 'Error, warning, or success icon shown inside the input.',
  },
  {
    name: 'Character counter',
    required: false,
    description:
      'Current and maximum character counts shown inside the input container.',
  },
  {
    name: 'Field status message',
    required: false,
    description:
      'Attached or detached error, warning, or success message associated with the field.',
  },
  {
    name: 'Tooltip status message',
    required: false,
    description:
      'Tooltip surface presenting the status message for the tooltip variant.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TextArea',
  displayName: 'Text Area',
  category: 'Form Controls',
  keywords: [
    'textarea',
    'textfield',
    'multiline',
    'comment',
    'message',
    'autoresize',
    'autosize',
    'charlimit',
  ],
  props: [
    {
      name: 'ref',
      type: 'React.Ref<HTMLTextAreaElement>',
      description: 'Ref forwarded to the underlying <textarea> element.',
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Label text for the textarea. Always rendered for accessibility.',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: 'Current value of the textarea.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string, e: ChangeEvent<HTMLTextAreaElement>) => void',
      description: 'Callback fired when the textarea value changes.',
    },
    {
      name: 'changeAction',
      type: '(value: string, e: ChangeEvent<HTMLTextAreaElement>) => void | Promise<void>',
      description:
        'Async action fired after onChange inside a React transition. Enables optimistic updates via useOptimistic.',
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
      description: 'Helper text displayed between the label and textarea.',
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
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disables the textarea, preventing interaction.',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Makes the textarea read-only: the value is shown at full opacity and still submits with the form, but cannot be edited. Unlike isDisabled, a read-only textarea is not dimmed and keeps its form value. isDisabled takes precedence when both are set.',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the textarea is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the textarea focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled TextArea in Tooltip, so the reason is attached to the field itself.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Puts the textarea in a loading state, showing a spinner inside the input.',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text shown when the textarea is empty.',
    },
    {
      name: 'rows',
      type: 'number',
      description: 'Number of visible text rows.',
      default: '3',
    },
    {
      name: 'maxLength',
      type: 'number',
      description:
        'Maximum number of characters allowed, counted as user-perceived characters: an emoji or flag sequence counts as one. When set, a character counter (current/max) is displayed inside the input container, anchored to the bottom-right beneath the text. Does not enforce the limit natively; when exceeded the counter turns red and shows a warning icon (a non-color cue), and screen-reader users hear the remaining/over-limit count announced. Consumers validating the limit should count with characterCount (exported from the package) so enforcement matches the displayed count.',
    },
    {
      name: 'status',
      type: "{ type: 'warning' | 'error' | 'success'; message?: string }",
      description:
        'Status indicator that applies a colored border and icon. An optional message is displayed in a floating box below the textarea.',
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
        'Tooltip text displayed in an info icon at the end of the label.',
    },
    {
      name: 'startIcon',
      type: 'IconType',
      description:
        'Icon component rendered inside the leading edge of the textarea wrapper. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'hasSpellCheck',
      type: 'boolean',
      description: 'Enables or disables browser spell checking.',
      default: 'true',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: 'Automatically focuses the textarea on mount.',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description:
        'Size of the textarea, affecting internal padding. Height is controlled by rows, not size.',
      default: "'md'",
    },
    {
      name: 'onPaste',
      type: '(e: ClipboardEvent<HTMLTextAreaElement>) => void',
      description: 'Callback fired when content is pasted into the textarea.',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        'HTML name attribute for the textarea element, useful for form submissions.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
    {
      name: 'onFocus',
      type: '(e: FocusEvent<HTMLTextAreaElement>) => void',
      description: 'Callback fired when the textarea receives focus.',
    },
    {
      name: 'onBlur',
      type: '(e: FocusEvent<HTMLTextAreaElement>) => void',
      description: 'Callback fired when the textarea loses focus.',
    },
    {
      name: 'autoComplete',
      type: 'string',
      description:
        'The native autocomplete attribute, forwarded to the textarea unchanged. Does not affect the controlled value.',
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
        className: 'astryx-text-area',
        visualProps: ['size', 'status'],
        states: ['disabled', 'readonly'],
      },
      {className: 'astryx-text-area-control'},
      {className: 'astryx-text-area-counter'},
    ],
    vars: [
      {
        name: '--_textarea-inline-padding',
        description:
          "Inline padding of the textarea's text. The wrapper stays flush (padding: 0) so the native resize grip sits in the true corner; this var carries the inset on the inner <textarea>, and the start icon, status/spinner, and character counter align to it.",
        default: 'var(--spacing-2)',
        private: true,
      },
    ],
    derived: [
      {
        property: 'paddingInline',
        vars: ['--_textarea-inline-padding'],
        replaces: true,
      },
    ],
  },
  usage: {
    anatomy,
    description:
      'TextArea is a multi-line text input for collecting longer-form content like comments, descriptions, or messages. Use it when the expected input spans multiple lines. For shorter, single-line values, use TextInput.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a visible label so users know what to enter. If the label must be hidden, set isLabelHidden with a descriptive label for screen readers.',
      },
      {
        guidance: true,
        description:
          'Set maxLength with a character counter when there is a defined limit; it helps users stay within bounds before they submit.',
      },
      {
        guidance: true,
        description:
          'Use the status prop to surface validation feedback inline: show success when input is valid, warning for soft limits, and error for hard failures.',
      },
      {
        guidance: true,
        description:
          'Add a description or placeholder to clarify expected content, like "Describe the issue in detail," but never rely on placeholder alone as the only label.',
      },
      {
        guidance: false,
        description:
          'Avoid using TextArea for short, single-line values like names or emails; use TextInput instead.',
      },
      {
        guidance: false,
        description:
          "Don't rely solely on placeholder text to communicate the purpose of the field; placeholders disappear on focus and are not accessible labels.",
      },
      {
        guidance: false,
        description:
          "Don't show a status message without also setting the status type; the colored border and icon are what draw the user's attention to the message.",
      },
      {
        guidance: false,
        description:
          "Don't wrap a disabled TextArea in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself.",
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'TextArea',
  displayName: 'Text Area',
  props: [
    {
      name: 'ref',
      type: 'React.Ref<HTMLTextAreaElement>',
      description: '转发至底层 <textarea> 元素的 ref。',
    },
    {
      name: 'label',
      type: 'string',
      description: '文本域的标签文本：始终渲染以确保无障碍性。',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: '文本域的当前值。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string, e: ChangeEvent<HTMLTextAreaElement>) => void',
      description: '文本域值变化时触发的回调。',
    },
    {
      name: 'changeAction',
      type: '(value: string, e: ChangeEvent<HTMLTextAreaElement>) => void | Promise<void>',
      description:
        '在 React transition 内于 onChange 之后触发的异步操作。通过 useOptimistic 启用乐观更新。',
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
      description: '显示在标签和文本域之间的辅助文本。',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '在标签旁显示"可选"指示器。与 isRequired 互斥。',
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
      description: '禁用文本域，阻止交互。',
      default: 'false',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        '将文本域设为只读：值以完整不透明度显示并仍随表单提交，但无法编辑。与 isDisabled 不同，只读文本域不会变暗，并保留其表单值。同时设置时 isDisabled 优先。',
      default: 'false',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        '说明文本域被禁用的原因。与 isDisabled 一起使用时，在悬停/键盘聚焦时显示工具提示，并通过 aria-disabled 保持文本域可聚焦（字段变为只读）。请使用此属性，而不是用 Tooltip 包裹已禁用的 TextArea。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: '使文本域进入加载状态，在输入框内显示旋转器。',
      default: 'false',
    },
    {
      name: 'placeholder',
      type: 'string',
      description: '文本域为空时显示的占位符文本。',
    },
    {
      name: 'rows',
      type: 'number',
      description: '可见文本行数。',
      default: '3',
    },
    {
      name: 'maxLength',
      type: 'number',
      description:
        '允许的最大字符数。设置后，在文本域下方显示字符计数器（当前/最大）。不原生强制限制：超出时计数器显示错误样式。',
    },
    {
      name: 'status',
      type: "{ type: 'warning' | 'error' | 'success'; message?: string }",
      description:
        '应用彩色边框和图标的状态指示器。可选消息显示在文本域下方的浮动框中。',
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
      description: '在标签末尾的信息图标中显示的工具提示文本。',
    },
    {
      name: 'startIcon',
      type: 'IconType',
      description: '在文本域包装器前端内部渲染的图标组件。',
    },
    {
      name: 'hasSpellCheck',
      type: 'boolean',
      description: '启用或禁用浏览器拼写检查。',
      default: 'true',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description: '挂载时自动聚焦文本域。',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '文本域的尺寸，影响内部填充。高度由 rows 控制，而非 size。',
      default: "'md'",
    },
    {
      name: 'onPaste',
      type: '(e: ClipboardEvent<HTMLTextAreaElement>) => void',
      description: '内容粘贴到文本域时触发的回调。',
    },
    {
      name: 'htmlName',
      type: 'string',
      description: '文本域元素的 HTML name 属性，用于表单提交。',
    },
    {
      name: 'onFocus',
      type: '(e: FocusEvent<HTMLTextAreaElement>) => void',
      description: '文本域获得焦点时触发的回调。',
    },
    {
      name: 'onBlur',
      type: '(e: FocusEvent<HTMLTextAreaElement>) => void',
      description: '文本域失去焦点时触发的回调。',
    },
    {
      name: 'autoComplete',
      type: 'string',
      description: '原生 autocomplete 属性，原样转发给文本域。不影响受控的值。',
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
        className: 'astryx-text-area',
        visualProps: ['size', 'status'],
        states: ['disabled', 'readonly'],
      },
      {className: 'astryx-text-area-control'},
      {className: 'astryx-text-area-counter'},
    ],
    vars: [
      {
        name: '--_textarea-inline-padding',
        description:
          '文本域文本的行内内边距。外层容器保持无内边距（padding: 0），使原生缩放手柄位于真正的角落；该变量在内部 <textarea> 上承载内边距，起始图标、状态/加载指示器和字符计数器都与之对齐。',
        default: 'var(--spacing-2)',
        private: true,
      },
    ],
    derived: [
      {
        property: 'paddingInline',
        vars: ['--_textarea-inline-padding'],
        replaces: true,
      },
    ],
  },
  usage: {
    description:
      'TextArea is a multi-line text input for collecting longer-form content like comments, descriptions, or messages. Use it when the expected input spans multiple lines. For shorter, single-line values, use TextInput.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Provide a visible label so users know what to enter. If the label must be hidden, set isLabelHidden with a descriptive label for screen readers.',
      },
      {
        guidance: true,
        description:
          'Set maxLength with a character counter when there is a defined limit; it helps users stay within bounds before they submit.',
      },
      {
        guidance: true,
        description:
          'Use the status prop to surface validation feedback inline: show success when input is valid, warning for soft limits, and error for hard failures.',
      },
      {
        guidance: true,
        description:
          'Add a description or placeholder to clarify expected content, like "Describe the issue in detail," but never rely on placeholder alone as the only label.',
      },
      {
        guidance: false,
        description:
          'Avoid using TextArea for short, single-line values like names or emails; use TextInput instead.',
      },
      {
        guidance: false,
        description:
          "Don't rely solely on placeholder text to communicate the purpose of the field; placeholders disappear on focus and are not accessible labels.",
      },
      {
        guidance: false,
        description:
          "Don't show a status message without also setting the status type; the colored border and icon are what draw the user's attention to the message.",
      },
      {
        guidance: false,
        description:
          "Don't wrap a disabled TextArea in Tooltip to explain why it's disabled. Use the disabledMessage prop, which attaches the reason to the field itself.",
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Multi-line text input for collecting longer user input.',
  usage: {
    description:
      'Multi-line input for comments, descriptions, messages. Use when input spans multiple lines; use TextInput for single-line.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Visible label or isLabelHidden with descriptive label for screen readers.',
      },
      {
        guidance: true,
        description: 'Set maxLength for character counter when a limit exists.',
      },
      {
        guidance: true,
        description:
          'Use status prop for inline validation: success, warning, error.',
      },
      {
        guidance: true,
        description:
          'Add description or placeholder for context; never placeholder alone as label.',
      },
      {
        guidance: false,
        description: 'Avoid TextArea for single-line values; use TextInput.',
      },
      {
        guidance: false,
        description:
          "Don't use placeholder as only label; disappears on focus, not accessible.",
      },
      {
        guidance: false,
        description:
          "Don't show status message without status type; border and icon draw attention.",
      },
      {
        guidance: false,
        description:
          "Don't wrap a disabled TextArea in Tooltip to explain the disabled state; use the disabledMessage prop instead.",
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
    ref: 'ref forwarded to underlying <textarea>.',
    label: 'Label text for textarea; always rendered for a11y.',
    value: 'Current textarea value.',
    onChange: 'Fired on textarea value change.',
    changeAction:
      'Async action after onChange in React transition. Enables useOptimistic.',
    isLabelHidden: 'Visually hides label; keeps screen reader access.',
    description: 'Helper text between label+textarea.',
    isOptional: 'Shows "Optional" indicator. Mutually exclusive w/ isRequired.',
    isRequired:
      'Shows "Required" indicator+sets aria-required. Mutually exclusive w/ isOptional.',
    isDisabled: 'Disables textarea, prevents interaction.',
    isReadOnly:
      'Read-only: value visible + still submits, but not editable. Unlike isDisabled: not dimmed.',
    disabledMessage:
      'Explains why textarea is disabled. With isDisabled, shows tooltip on hover/focus + keeps textarea focusable via aria-disabled (field becomes read-only). Use instead of wrapping a disabled TextArea in Tooltip.',
    isLoading: 'Loading state w/ spinner inside input.',
    placeholder: 'Placeholder when textarea empty.',
    rows: 'Visible text rows.',
    maxLength:
      'Max chars allowed. Shows counter (current/max) inside the container, bottom-right beneath the text. No native enforcement; over-limit shows red + a warning icon and is announced to screen readers.',
    status:
      'Colored border+icon status. Optional floating message below textarea.',
    statusVariant:
      'How status message is placed: attached overlaps below input; detached floats below w/ spacing; tooltip hides the box and shows it on the status icon.',
    labelTooltip: 'Tooltip in info icon at label end.',
    startIcon: 'Icon inside leading edge of textarea wrapper.',
    hasSpellCheck: 'Enables/disables browser spell checking.',
    hasAutoFocus: 'Auto-focus textarea on mount.',
    size: 'Textarea size; affects internal padding. Height controlled by rows.',
    onPaste: 'Fired on paste into textarea.',
    htmlName: 'HTML name attr for form submissions.',
    onFocus: 'Callback on focus.',
    onBlur: 'Callback on blur.',
    autoComplete:
      'Native autocomplete attr, forwarded unchanged. Does not affect the controlled value.',
  },
};
