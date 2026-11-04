// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CheckboxInput',
  displayName: 'Checkbox Input',
  group: 'Checkbox',
  category: 'Form Controls',
  keywords: [
    'checkbox',
    'check',
    'toggle',
    'tick',
    'indeterminate',
    'boolean',
    'tristate',
  ],
  props: [
    {
      name: 'ref',
      type: 'React.Ref<HTMLInputElement>',
      description: 'Ref forwarded to the underlying <input> element.',
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Label text for the checkbox (always rendered for accessibility).',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Whether to visually hide the label (still accessible to screen readers).',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text displayed below the label.',
    },
    {
      name: 'value',
      type: "boolean | 'indeterminate'",
      description:
        'Whether the checkbox is checked, unchecked, or indeterminate.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(checked: boolean, e: ChangeEvent<HTMLInputElement>) => void',
      description: 'Callback fired when the checkbox state changes.',
    },
    {
      name: 'changeAction',
      type: '(checked: boolean, e: ChangeEvent<HTMLInputElement>) => void | Promise<void>',
      description:
        'Async action on change. Fires after onChange if not prevented. Shows loading spinner while pending.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description:
        'Whether the checkbox is in a loading state. Shows spinner and prevents interaction.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the checkbox is disabled.',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        'The HTML name attribute for the underlying checkbox input, useful for form submissions (submits "on" when checked).',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the checkbox is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the checkbox focusable via aria-disabled (toggling stays blocked). Use this instead of wrapping a disabled CheckboxInput in Tooltip. Disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        'Whether the checkbox is read-only. Displays the current state at full opacity but prevents interaction. Unlike `isDisabled`, read-only checkboxes are not visually dimmed.',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        'Whether the field is optional. Mutually exclusive with isRequired.',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        'Whether the checkbox is required. Mutually exclusive with isOptional.',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description:
        'The size of the checkbox. sm for compact layouts, md for default.',
      default: "'md'",
    },
    {
      name: 'onFocus',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: 'Callback fired when the checkbox receives focus.',
    },
    {
      name: 'onBlur',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: 'Callback fired when the checkbox loses focus.',
    },
    {
      name: 'labelIcon',
      type: 'ReactNode | IconType',
      description:
        'Semantic icon name or custom content displayed before the label text. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'status',
      type: "{ type: 'error' | 'warning' | 'success', message: string }",
      description:
        'Status indicator. Displays a colored message box below the checkbox and sets aria-invalid for errors.',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned.',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-checkbox-input', visualProps: ['size']},
      {
        className: 'astryx-checkbox-indicator',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      },
      {className: 'astryx-checkbox-label'},
    ],
  },
  usage: {
    accessibility: [
      {
        name: 'Checkbox box',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Rest', 'Hover', 'Pointer down', 'Checked'],
        description:
          'The box edge (unchecked) and fill (checked) must have at least 3:1 contrast with the surface behind them. For Hover and Pointer down, measure the final colors after the tint and the pressed overlay are applied.',
      },
    ],
    description:
      'CheckboxInput toggles a single on/off value. Use it for settings like "Enable notifications", terms acceptance, or opt-in choices. For multiple checkboxes in a group, use CheckboxList instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide a visible label so the user knows what they are toggling. Use isLabelHidden only when surrounding context makes it obvious.',
      },
      {
        guidance: true,
        description:
          'Add a description for choices that need extra context, like explaining what "Share usage data" actually shares.',
      },
      {
        guidance: true,
        description:
          'Use the indeterminate state for "select all" checkboxes when only some items in a group are selected.',
      },
      {
        guidance: false,
        description:
          'Use a checkbox for mutually exclusive choices; use RadioList when only one option can be selected.',
      },
      {
        guidance: false,
        description:
          'Use a checkbox for actions that take effect immediately; use a toggle switch or button instead.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled checkbox in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
    anatomy: [
      {
        name: 'Checkbox',
        required: true,
        description:
          'The check box itself: unchecked, checked, or indeterminate.',
      },
      {
        name: 'Label',
        required: true,
        description:
          'Text describing what the checkbox controls. Always present for accessibility.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Helper text below the label with additional context.',
      },
      {
        name: 'Status message',
        required: false,
        description:
          'An error, warning, or success message below the checkbox.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'CheckboxInput',
  displayName: 'Checkbox Input',
  usage: {
    description:
      'CheckboxInput toggles a single on/off value. Use it for settings like "Enable notifications", terms acceptance, or opt-in choices. For multiple checkboxes in a group, use CheckboxList instead.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide a visible label so the user knows what they are toggling. Use isLabelHidden only when surrounding context makes it obvious.',
      },
      {
        guidance: true,
        description:
          'Add a description for choices that need extra context, like explaining what "Share usage data" actually shares.',
      },
      {
        guidance: true,
        description:
          'Use the indeterminate state for "select all" checkboxes when only some items in a group are selected.',
      },
      {
        guidance: false,
        description:
          'Use a checkbox for mutually exclusive choices; use RadioList when only one option can be selected.',
      },
      {
        guidance: false,
        description:
          'Use a checkbox for actions that take effect immediately; use a toggle switch or button instead.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled checkbox in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
  props: [
    {
      name: 'ref',
      type: 'React.Ref<HTMLInputElement>',
      description: '转发至底层 <input> 元素的 ref。',
    },
    {
      name: 'label',
      type: 'string',
      description: '复选框的标签文本（始终为无障碍性而渲染）。',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '是否视觉隐藏标签（屏幕阅读器仍可访问）。',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: '显示在标签下方的描述文本。',
    },
    {
      name: 'value',
      type: "boolean | 'indeterminate'",
      description: '复选框是否为选中、未选中或不确定状态。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(checked: boolean, e: ChangeEvent<HTMLInputElement>) => void',
      description: '复选框状态变更时触发的回调。',
    },
    {
      name: 'changeAction',
      type: '(checked: boolean, e: ChangeEvent<HTMLInputElement>) => void | Promise<void>',
      description:
        '异步变更操作。在 onChange 之后触发（未被阻止时）。等待期间显示加载旋转器。',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: '复选框是否处于加载状态。显示旋转器并阻止交互。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '复选框是否禁用。',
      default: 'false',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        '底层复选框输入的 HTML name 属性，用于表单提交（勾选时提交 "on"）。',
    },
    {
      name: 'disabledMessage',
      type: 'string',
      description:
        'Explains why the checkbox is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the checkbox focusable via aria-disabled (toggling stays blocked). Use this instead of wrapping a disabled CheckboxInput in Tooltip: disabled controls swallow the hover events an external Tooltip needs.',
    },
    {
      name: 'isReadOnly',
      type: 'boolean',
      description:
        '复选框是否为只读。以完整不透明度显示当前状态但阻止交互。与 isDisabled 不同，只读复选框不会变暗。',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '字段是否可选。与 isRequired 互斥。',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: '复选框是否必填。与 isOptional 互斥。',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: '复选框尺寸。sm 用于紧凑布局，md 为默认。',
      default: "'md'",
    },
    {
      name: 'onFocus',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: '复选框获得焦点时触发的回调。',
    },
    {
      name: 'onBlur',
      type: '(e: FocusEvent<HTMLInputElement>) => void',
      description: '复选框失去焦点时触发的回调。',
    },
    {
      name: 'labelIcon',
      type: 'ReactNode | IconType',
      description: '标签文本前显示的语义图标名称或自定义内容。',
    },
    {
      name: 'status',
      type: "{ type: 'error' | 'warning' | 'success', message: string }",
      description:
        '状态指示器。在复选框下方显示彩色消息框，错误时设置 aria-invalid。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-checkbox-input',
        visualProps: ['size'],
      },
      {
        className: 'astryx-checkbox-indicator',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      },
      {className: 'astryx-checkbox-label'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'single on/off toggle for settings, terms, and opt-in choices',
  usage: {
    description:
      'CheckboxInput toggles a single on/off value. Use for settings, terms acceptance, opt-in choices. Use CheckboxList for groups.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Always provide a visible label so user knows what they're toggling. Use isLabelHidden only when surrounding context makes it obvious.",
      },
      {
        guidance: true,
        description:
          'Add a description for choices that need extra context, e.g. what "Share usage data" actually shares.',
      },
      {
        guidance: true,
        description:
          'Use the indeterminate state for "select all" checkboxes when only some items in a group are selected.',
      },
      {
        guidance: false,
        description:
          'Use a checkbox for mutually exclusive choices; use RadioList when only one option can be selected.',
      },
      {
        guidance: false,
        description:
          'Use a checkbox for actions that take effect immediately; use a toggle switch or button instead.',
      },
      {
        guidance: false,
        description:
          'Wrap a disabled checkbox in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.',
      },
    ],
  },
  propDescriptions: {
    ref: 'ref forwarded to underlying <input>',
    label: 'label text; always rendered for a11y',
    isLabelHidden: 'visually hide label (still accessible to screen readers)',
    description: 'text below label',
    value: 'checked, unchecked, or indeterminate',
    onChange: 'callback on state change',
    changeAction:
      'async action; fires after onChange, shows spinner while pending',
    isLoading: 'shows spinner + prevents interaction',
    isDisabled: 'disable checkbox',
    htmlName: 'HTML name attr for the checkbox; submits "on" when checked.',
    isOptional: 'mark field as optional (mutually exclusive w/ isRequired)',
    isRequired: 'mark field as required (mutually exclusive w/ isOptional)',
    size: 'sm (compact) or md (default)',
    onFocus: 'callback on focus',
    onBlur: 'callback on blur',
    labelIcon: 'semantic icon name or custom content before label text',
    status: 'error/warning/success with message; sets aria-invalid on error',
  },
};
