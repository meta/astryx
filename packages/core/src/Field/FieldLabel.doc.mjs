// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'FieldLabel',
  subComponentOf: 'Field',
  displayName: 'Field Label',
  isHiddenFromOverview: true,
  description:
    'Standalone label group for one control or a caller-labelled group, with optional supporting text, optionality indicators, icon, and tooltip.',
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label text, always rendered for accessibility.',
      required: true,
    },
    {
      name: 'inputID',
      type: 'string',
      description: 'ID of the input this label is for.',
      required: true,
    },
    {
      name: 'labelID',
      type: 'string',
      description:
        'ID applied to the label element itself. Use it with `aria-labelledby` when `isGroupLabel` is true.',
    },
    {
      name: 'isGroupLabel',
      type: 'boolean',
      description:
        'Render a span that can name a group instead of a native label for one control.',
      default: 'false',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hide the label and description while keeping both available to assistive technology.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Use disabled label presentation for the associated control.',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description:
        "Show the localized optional indicator unless it matches FormLayout's default optionality.",
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description:
        "Show the localized required indicator unless it matches FormLayout's default optionality.",
      default: 'false',
    },
    {
      name: 'labelIcon',
      type: 'ReactNode | IconType',
      description:
        'Icon or rendered icon content before the label text. See `astryx docs icons` for semantic names.',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        'Help text for an info button after the label, named "About {label}". Hover and keyboard focus preview it; a click, tap, Enter or Space opens or closes it and never focuses the field or toggles the control.',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description:
        "Supporting content displayed below the label and kept separate from the control's accessible name.",
    },
    {
      name: 'descriptionID',
      type: 'string',
      description:
        'ID applied to the supporting description for caller-owned `aria-describedby` wiring.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLLabelElement>',
      description:
        'Ref forwarded to the label element. Group mode currently renders a span.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles applied to the label element after its base and state styles.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name appended to the label element.',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description:
        'Inline styles applied to the label element after StyleX inline styles.',
    },
  ],
};

export const docsZh = {
  name: 'FieldLabel',
  isHiddenFromOverview: true,
  displayName: 'Field Label',
  description:
    '独立标签组，可标记单个控件或调用方命名的控件组，并支持说明文本、可选/必填指示器、图标和工具提示。',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '标签文本，始终为辅助技术保留。',
      required: true,
    },
    {
      name: 'inputID',
      type: 'string',
      description: '此标签关联的输入框 ID。',
      required: true,
    },
    {
      name: 'labelID',
      type: 'string',
      description:
        '应用到标签元素本身的 ID。isGroupLabel 为 true 时用于 aria-labelledby。',
    },
    {
      name: 'isGroupLabel',
      type: 'boolean',
      description:
        '渲染用于命名控件组的 span，而不是关联单个控件的原生 label。',
      default: 'false',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '视觉隐藏标签和说明，同时为辅助技术保留。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '使用关联控件的禁用标签样式。',
      default: 'false',
    },
    {
      name: 'isOptional',
      type: 'boolean',
      description: '当其不匹配 FormLayout 默认值时显示本地化的可选指示器。',
      default: 'false',
    },
    {
      name: 'isRequired',
      type: 'boolean',
      description: '当其不匹配 FormLayout 默认值时显示本地化的必填指示器。',
      default: 'false',
    },
    {
      name: 'labelIcon',
      type: 'ReactNode | IconType',
      description: '标签文本前的图标或已渲染图标内容。',
    },
    {
      name: 'labelTooltip',
      type: 'string',
      description:
        '标签后信息按钮（名称为“About {label}”）显示的帮助文本。悬停和键盘聚焦可预览；点击、点按、Enter 或 Space 可打开或关闭帮助，绝不会聚焦字段或切换控件。',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: '标签下方的说明内容，与控件的无障碍名称保持分离。',
    },
    {
      name: 'descriptionID',
      type: 'string',
      description: '应用到说明内容的 ID，供调用方连接 aria-describedby。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLLabelElement>',
      description: '转发到标签元素的 ref。控件组模式当前渲染 span。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '在基础和状态样式之后应用到标签元素的 StyleX 样式。',
    },
    {
      name: 'className',
      type: 'string',
      description: '追加到标签元素的 CSS 类名。',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description: '在 StyleX 内联样式之后应用到标签元素的内联样式。',
    },
  ],
};

export const docsDense = {
  name: 'FieldLabel',
  isHiddenFromOverview: true,
  displayName: 'Field Label',
  description:
    'label group for one control or a caller-labelled group; supporting text, optionality, icon, tooltip',
  propDescriptions: {
    label: 'Label text.',
    inputID: 'ID of the associated control.',
    labelID: 'ID of the label element for caller-owned aria-labelledby.',
    isGroupLabel: 'Render a group-label span instead of a native label.',
    isLabelHidden: 'Visually hide label and description.',
    isDisabled: 'Use disabled label presentation.',
    isOptional: 'Show localized optional exception indicator.',
    isRequired: 'Show localized required exception indicator.',
    labelIcon: 'Icon type or rendered icon content before label text.',
    labelTooltip: 'Help text for the info button after the label.',
    description: 'Supporting content outside the accessible name.',
    descriptionID: 'ID for caller-owned aria-describedby wiring.',
    ref: 'Ref forwarded to the label element; group mode renders a span.',
    xstyle: 'StyleX styles for the label element.',
    className: 'CSS class name for the label element.',
    style: 'Inline styles for the label element.',
  },
};
