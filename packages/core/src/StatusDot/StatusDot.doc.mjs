// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Dot',
    required: true,
    description:
      'Painted status dot that carries the selected semantic variant.',
  },
  {
    name: 'Status icon',
    required: false,
    description: 'Optional caller-supplied icon rendered inside the dot.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'StatusDot',
  displayName: 'Status Dot',
  category: 'Feedback & Status',
  keywords: [
    'statusdot',
    'dot',
    'indicator',
    'status',
    'signal',
    'presence',
    'availability',
    'online',
    'pip',
  ],
  props: [
    {
      name: 'variant',
      type: "'success' | 'warning' | 'error' | 'accent' | 'neutral'",
      description: 'Semantic color variant.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label surfaced via aria-label.',
      required: true,
    },
    {
      name: 'isPulsing',
      type: 'boolean',
      description:
        'Enables a pulse animation; respects prefers-reduced-motion: reduce.',
      default: 'false',
    },
    {
      name: 'tooltip',
      type: 'string',
      description: 'Tooltip text shown on hover to explain the status meaning.',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description:
        "Optional icon rendered centered inside the dot, painted in currentColor (the variant's ink). Gives the status a non-color mark, so use a different icon per status. Booleans and empty strings are ignored, so `cond && <Icon />` is safe. Same contract as AvatarStatusDot.",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-status-dot', visualProps: ['variant']}],
  },
  usage: {
    anatomy,
    description:
      'A small colored dot that communicates status like online/offline presence or severity levels. Supports five semantic variants and an optional pulse animation. Always pair with a visible text label, as color alone should not carry meaning.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use StatusDot as a binary present/absent signal; avoid encoding many distinct states in a single dot, since color and size alone cannot reliably distinguish them.',
      },
      {
        guidance: true,
        description:
          'Always pair with a visible text label so status is not conveyed by color alone.',
      },
      {
        guidance: true,
        description:
          'Provide a descriptive `label` prop for screen reader accessibility.',
      },
      {
        guidance: true,
        description:
          'Pair the dot with an icon that carries the status as a distinct shape when it must stand on its own without adjacent text, so meaning survives without color.',
      },
      {
        guidance: true,
        description:
          "If you can't add a label or an icon, make sure the status is conveyed elsewhere accessibly (e.g. adjacent text, a table column, or a live region).",
      },
      {
        guidance: false,
        description:
          'Rely on color alone to communicate status; StatusDot is not fully accessible in isolation, so the builder must make the status distinguishable in context via a label, an icon, or an accessible alternative.',
      },
      {
        guidance: false,
        description:
          'Use the pulse animation for purely decorative purposes; reserve it for states that require immediate attention.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'StatusDot',
  displayName: 'Status Dot',
  props: [
    {
      name: 'variant',
      type: "'success' | 'warning' | 'error' | 'accent' | 'neutral'",
      description: '语义颜色变体。',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: '通过 aria-label 暴露的无障碍标签。',
      required: true,
    },
    {
      name: 'isPulsing',
      type: 'boolean',
      description: '启用脉冲动画；尊重 prefers-reduced-motion: reduce 设置。',
      default: 'false',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description:
        '可选图标，居中渲染于圆点内，以 currentColor（变体的前景色）着色。为状态提供非颜色标记，请为每个状态使用不同图标。布尔值和空字符串会被忽略，因此 `cond && <Icon />` 是安全的。与 AvatarStatusDot 的契约一致。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [{className: 'astryx-status-dot', visualProps: ['variant']}],
  },
  usage: {
    anatomy,
    description:
      'A small colored dot that communicates status like online/offline presence or severity levels. Supports five semantic variants and an optional pulse animation. Always pair with a visible text label, as color alone should not carry meaning.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use StatusDot as a binary present/absent signal; avoid encoding many distinct states in a single dot, since color and size alone cannot reliably distinguish them.',
      },
      {
        guidance: true,
        description:
          'Always pair with a visible text label so status is not conveyed by color alone.',
      },
      {
        guidance: true,
        description:
          'Provide a descriptive `label` prop for screen reader accessibility.',
      },
      {
        guidance: true,
        description:
          'Pair the dot with an icon that carries the status as a distinct shape when it must stand on its own without adjacent text, so meaning survives without color.',
      },
      {
        guidance: true,
        description:
          "If you can't add a label or an icon, make sure the status is conveyed elsewhere accessibly (e.g. adjacent text, a table column, or a live region).",
      },
      {
        guidance: false,
        description:
          'Rely on color alone to communicate status; StatusDot is not fully accessible in isolation, so the builder must make the status distinguishable in context via a label, an icon, or an accessible alternative.',
      },
      {
        guidance: false,
        description:
          'Use the pulse animation for purely decorative purposes; reserve it for states that require immediate attention.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Small colored dot indicator for status display (online/offline, severity, etc).',
  usage: {
    anatomy,
    description:
      'A small colored dot that communicates status like online/offline presence or severity levels. Supports five semantic variants and an optional pulse animation. Always pair with a visible text label, as color alone should not carry meaning.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use StatusDot as a binary present/absent signal; avoid encoding many distinct states in a single dot, since color and size alone cannot reliably distinguish them.',
      },
      {
        guidance: true,
        description:
          'Always pair with a visible text label so status is not conveyed by color alone.',
      },
      {
        guidance: true,
        description:
          'Provide a descriptive `label` prop for screen reader accessibility.',
      },
      {
        guidance: true,
        description:
          'Pair the dot with an icon that carries the status as a distinct shape when it must stand on its own without adjacent text, so meaning survives without color.',
      },
      {
        guidance: true,
        description:
          "If you can't add a label or an icon, make sure the status is conveyed elsewhere accessibly (e.g. adjacent text, a table column, or a live region).",
      },
      {
        guidance: false,
        description:
          'Rely on color alone to communicate status; StatusDot is not fully accessible in isolation, so the builder must make the status distinguishable in context via a label, an icon, or an accessible alternative.',
      },
      {
        guidance: false,
        description:
          'Use the pulse animation for purely decorative purposes; reserve it for states that require immediate attention.',
      },
    ],
  },
  propDescriptions: {
    variant: 'Semantic color variant.',
    label: 'Accessible label via aria-label.',
    isPulsing: 'Pulse animation; respects prefers-reduced-motion: reduce.',
    tooltip: 'Tooltip text on hover to explain status meaning.',
    icon: 'Optional ReactNode rendered centered in the dot (currentColor ink); a non-color mark for the status, use a different icon per status. Booleans/empty strings ignored (safe for cond && <Icon/>). Same contract as AvatarStatusDot.',
    xstyle: 'StyleX layout styles; must be stylex.create() value.',
  },
};
