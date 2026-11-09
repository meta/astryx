// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Token',
  displayName: 'Token',
  category: 'Content',
  keywords: ["token","chip","tag","pill","label","removable","dismissible","filter chip","closable"],
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Text label displayed inside the token.',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'The size of the token.',
      default: "'md'",
    },
    {
      name: 'color',
      type: "'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray'",
      description: 'Color variant of the token.',
      default: "'default'",
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Optional icon rendered before the label.',
      slotElements: [{__element: 'Icon', props: {icon: 'check', size: 'sm'}}],
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Whether the token is disabled; reduces opacity and blocks interactions.',
      default: 'false',
    },
    {
      name: 'onRemove',
      type: '(e: React.MouseEvent) => void',
      description:
        'Callback fired when the remove button is clicked. When provided, an X button is rendered inside the token.',
    },
    {
      name: 'onClick',
      type: '(e: React.MouseEvent) => void',
      description:
        'Click handler. When provided, the token renders as a <span> container with an invisible <button> inside for accessibility.',
    },
    {
      name: 'href',
      type: 'string',
      description:
        'Link URL. When provided, the token renders as an <a> element. The destination follows the shared navigation rule described on the Link `href` prop.',
    },
    {
      name: 'description',
      type: 'string',
      description:
        'Accessible description applied via aria-description on the root element.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content rendered after the label and before the remove button.',
      slotElements: [
        {__element: 'Icon', props: {icon: 'chevronDown', size: 'sm'}},
        {__element: 'Badge', props: {label: '3'}},
      ],
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        'Visually hides the label using a screen-reader-only clip technique; the label remains accessible.',
      default: 'false',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],  theming: {
    targets: [
      {className: 'astryx-token', visualProps: ['color', 'size'], states: ['disabled']},
    ],
  },
  usage: {
    description:
      'Token is a small, inline element for representing discrete pieces of associated data, like tags, categories, or selections. Use it to label content, show active filters, or represent removable items like selected recipients in a compose field.',
    bestPractices: [
      {guidance: true, description: 'Use color to distinguish categories (for example, green for "Active", red for "Blocked", blue for "In Review") so users can scan status at a glance.'},
      {guidance: true, description: 'Provide an onRemove callback when tokens represent user selections that can be undone, like filters or multi-select values.'},
      {guidance: true, description: 'Add a leading icon when it helps identify the token type faster, like a person icon for user tokens or a tag icon for labels.'},
      {guidance: true, description: 'Keep labels short: one to three words. Tokens truncate with ellipsis when the text overflows.'},
      {guidance: false, description: 'Don\'t use tokens for primary actions or navigation; use Button or Link instead. Tokens are for displaying metadata, not triggering workflows.'},
      {guidance: false, description: 'Don\'t hide the label unless the icon alone is universally understood. A color dot without text is ambiguous.'},
      {guidance: false, description: 'Don\'t mix too many colors in one token group. Stick to two or three meaningful colors so the palette stays scannable.'},
    ],
    anatomy: [
      {name: 'Icon', required: false, description: 'A leading icon that identifies the token type, like a user avatar or category symbol.'},
      {name: 'Label', required: true, description: 'The visible text. Also used as the accessible name when isLabelHidden is true.'},
      {name: 'End content', required: false, description: 'Trailing content after the label, like a count badge or status dot.'},
      {name: 'Remove button', required: false, description: 'An X button that appears when onRemove is provided, letting users dismiss the token.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Token',
  displayName: 'Token',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '显示在标记内部的文本标签。',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '标记的大小。',
      default: "'md'",
    },
    {
      name: 'color',
      type: "'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray'",
      description: '标记的颜色变体。',
      default: "'default'",
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: '在标签前渲染的可选图标。',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        '标记是否被禁用；降低透明度并阻止交互。',
      default: 'false',
    },
    {
      name: 'onRemove',
      type: '(e: React.MouseEvent) => void',
      description:
        '点击移除按钮时触发的回调。提供时，标记内会渲染一个 X 按钮。',
    },
    {
      name: 'onClick',
      type: '(e: React.MouseEvent) => void',
      description:
        '点击处理函数。提供时，标记渲染为 <span> 容器，内部包含不可见的 <button> 以确保可访问性。',
    },
    {
      name: 'href',
      type: 'string',
      description:
        '链接 URL。提供时，标记渲染为 <a> 元素。',
    },
    {
      name: 'description',
      type: 'string',
      description:
        '通过 aria-description 应用于根元素的无障碍描述。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        '在标签之后、移除按钮之前渲染的内容。',
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description:
        '使用仅屏幕阅读器可见的裁剪技术视觉隐藏标签；标签仍然保持可访问性。',
      default: 'false',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，不能是内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-token', visualProps: ['color', 'size'], states: ['disabled']},
    ],
  },
  usage: {
    description:
      'Token is a small, inline element for representing discrete pieces of associated data, like tags, categories, or selections. Use it to label content, show active filters, or represent removable items like selected recipients in a compose field.',
    bestPractices: [
      {guidance: true, description: 'Use color to distinguish categories (for example, green for "Active", red for "Blocked", blue for "In Review") so users can scan status at a glance.'},
      {guidance: true, description: 'Provide an onRemove callback when tokens represent user selections that can be undone, like filters or multi-select values.'},
      {guidance: true, description: 'Add a leading icon when it helps identify the token type faster, like a person icon for user tokens or a tag icon for labels.'},
      {guidance: true, description: 'Keep labels short: one to three words. Tokens truncate with ellipsis when the text overflows.'},
      {guidance: false, description: 'Don\'t use tokens for primary actions or navigation; use Button or Link instead. Tokens are for displaying metadata, not triggering workflows.'},
      {guidance: false, description: 'Don\'t hide the label unless the icon alone is universally understood. A color dot without text is ambiguous.'},
      {guidance: false, description: 'Don\'t mix too many colors in one token group. Stick to two or three meaningful colors so the palette stays scannable.'},
    ],
    anatomy: [
      {name: 'Icon', required: false, description: 'A leading icon that identifies the token type, like a user avatar or category symbol.'},
      {name: 'Label', required: true, description: 'The visible text. Also used as the accessible name when isLabelHidden is true.'},
      {name: 'End content', required: false, description: 'Trailing content after the label, like a count badge or status dot.'},
      {name: 'Remove button', required: false, description: 'An X button that appears when onRemove is provided, letting users dismiss the token.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'compact chip/tag for inline metadata, filters, selections. 11 colors, 3 sizes, removable, clickable, linkable.',
  usage: {
    description:
      'Token is a small, inline element for representing discrete pieces of associated data, like tags, categories, or selections. Use for labeling content, showing active filters, or representing removable items.',
    bestPractices: [
      {guidance: true, description: 'Color-code categories (green for active, red for blocked, blue for review) for fast scanning.'},
      {guidance: true, description: 'Provide onRemove when tokens represent dismissible user selections like filters or multi-select values.'},
      {guidance: true, description: 'Add a leading icon when it helps identify the token type: person icon for users, tag icon for labels.'},
      {guidance: true, description: 'Keep labels to one to three words. Tokens truncate with ellipsis on overflow.'},
      {guidance: false, description: 'Don\'t use tokens for actions or navigation; use Button or Link. Tokens display metadata, not trigger workflows.'},
      {guidance: false, description: 'Don\'t hide the label unless the icon alone is universally clear.'},
      {guidance: false, description: 'Don\'t mix too many colors in one group. Two or three meaningful colors keeps it scannable.'},
    ],
  },
  propDescriptions: {
    label: 'Text label inside token.',
    size: "Token size; 'sm', 'md', or 'lg'.",
    color: 'Color variant of token.',
    icon: 'Optional icon before label.',
    isDisabled: 'Reduces opacity, blocks interactions.',
    onRemove: 'Fired on remove button click. Renders X button when provided.',
    onClick: 'Click handler. Renders <span> w/ invisible <button> inside for a11y.',
    href: 'Link URL. Renders as <a> element. Follows the shared navigation rule (see Link href).',
    description: 'A11y description via aria-description on root.',
    endContent: 'Content after label, before remove button.',
    isLabelHidden: 'Visually hides label w/ screen-reader-only clip; stays accessible.',
    xstyle: 'StyleX layout styles (margins, positioning). Must be stylex.create() value.',
  },
};
