// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LineClamp',
  displayName: 'Line Clamp',
  category: 'Layout',
  keywords: [
    'clamp',
    'truncate',
    'ellipsis',
    'overflow',
    'lines',
    'multiline',
    'text',
  ],
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Content to clamp. LineClamp wraps arbitrary children (mixed inline content, nested elements) and clamps the whole block, rather than one Text component.',
      required: true,
    },
    {
      name: 'maxLines',
      type: 'number',
      description:
        'Maximum number of lines to show before clamping with an ellipsis.',
      required: true,
    },
    {
      name: 'hasTooltip',
      type: "boolean | 'above' | 'below' | 'start' | 'end'",
      description:
        'Show a tooltip with the full text content on hover or keyboard focus when clamped. A clamped root is focusable (tabindex 0) so keyboard users can reach the tooltip; a tabIndex you pass wins. true shows at default position, false disables it, or pass a placement.',
      default: 'true',
    },
    {
      name: 'as',
      type: "'div' | 'span' | 'p'",
      description: 'HTML element to render.',
      default: "'div'",
    },
  ],
  usage: {
    description:
      "Clamps arbitrary content to a fixed number of lines with an ellipsis. Text's maxLines clamps the Text component's own content; LineClamp is the composable version — wrap it around any children (mixed inline content, nested elements) to clamp the whole block to N lines. Truncation detection reuses useTruncation (the same hook Text uses), so overflow is measured correctly even while -webkit-line-clamp clips scrollHeight.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use LineClamp when clamping a block of mixed or composed content (not a single Text node).',
      },
      {
        guidance: true,
        description:
          "Use Text's own maxLines prop when clamping a single Text node — no need to wrap it in LineClamp.",
      },
      {
        guidance: false,
        description:
          'Disable the tooltip (hasTooltip={false}) when the clamped content is already reachable elsewhere on the page, to avoid a redundant announcement.',
      },
      {
        guidance: true,
        description:
          'A link, button, form control or element with a tabindex that falls past the visible lines (e.g. a trailing link) is automatically removed from the tab order and hidden from assistive tech while clipped, and restored the moment it is no longer clipped, including when a child adds or re-enables one later. The element that currently has focus is never hidden. No consumer action needed, but avoid relying on Tab reaching a link that only sometimes clips.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'LineClamp',
  displayName: 'Line Clamp',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description:
        '要截断的内容。LineClamp 包裹任意子节点（混合内联内容、嵌套元素）并截断整个区块，而不是单个 Text 组件。',
      required: true,
    },
    {
      name: 'maxLines',
      type: 'number',
      description: '截断前显示的最大行数。',
      required: true,
    },
    {
      name: 'hasTooltip',
      type: "boolean | 'above' | 'below' | 'start' | 'end'",
      description:
        '截断时在悬停或键盘聚焦时显示完整文本的工具提示；被截断的根元素可聚焦（tabindex 0），你传入的 tabIndex 优先。true 为默认位置显示，false 禁用，或传入具体位置。',
      default: 'true',
    },
    {
      name: 'as',
      type: "'div' | 'span' | 'p'",
      description: '要渲染的 HTML 元素。',
      default: "'div'",
    },
  ],
  usage: {
    description:
      '将任意内容截断为固定行数并显示省略号。Text 的 maxLines 截断 Text 组件自身的内容；LineClamp 是可组合版本 —— 用它包裹任意子节点（混合内联内容、嵌套元素）即可将整个区块截断为 N 行。',
    bestPractices: [
      {
        guidance: true,
        description:
          '当需要截断混合或组合内容（而非单个 Text 节点）时使用 LineClamp。',
      },
      {
        guidance: true,
        description:
          '截断单个 Text 节点时使用 Text 自身的 maxLines 属性，无需用 LineClamp 包裹。',
      },
      {
        guidance: false,
        description:
          '当截断内容已在页面其他位置可访问时，禁用工具提示（hasTooltip={false}）以避免重复播报。',
      },
      {
        guidance: true,
        description:
          '落在可见行之外的链接、按钮、表单控件或带 tabindex 的元素（例如一个尾部链接）会在被截断时自动从 Tab 顺序中移除并对辅助技术隐藏，一旦不再被截断即恢复，子组件之后新增或重新启用的元素同样适用；当前持有焦点的元素不会被隐藏。无需消费者处理，但应避免依赖 Tab 到达一个只是有时被截断的链接。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Clamps arbitrary content to N lines with an ellipsis; composable version of Text maxLines.',
  usage: {
    description:
      'Wrap any children (mixed inline content, nested elements) to clamp the whole block to N lines. Reuses useTruncation for overflow detection.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for clamping a block of mixed/composed content, not a single Text node.',
      },
      {
        guidance: true,
        description: "Use Text's own maxLines for a single Text node instead.",
      },
      {
        guidance: false,
        description:
          'Disable tooltip when content is reachable elsewhere, to avoid redundant announcement.',
      },
      {
        guidance: true,
        description:
          'A link, button, form control or tabindex element past the visible lines is auto-removed from the tab order while clipped (never the focused one), restored once not clipped, including late additions. No consumer action needed.',
      },
    ],
  },
  propDescriptions: {
    children:
      'Content to clamp. Composable version of maxLines — wraps arbitrary children.',
    maxLines: 'Max lines before clamping with ellipsis.',
    hasTooltip:
      'Tooltip with full text on hover or focus when clamped. Clamped root is focusable. true/false/placement.',
    as: "HTML element to render. Default 'div'.",
  },
};
