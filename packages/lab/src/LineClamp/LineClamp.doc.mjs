// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('../docs-types').ComponentDoc} */

export const docs = {
  name: 'LineClamp',
  displayName: 'Line Clamp',
  category: 'Layout',
  keywords: ["clamp","truncate","ellipsis","overflow","lines","multiline","text"],
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content to clamp. Unlike Text\'s maxLines (which truncates a single text node), LineClamp wraps arbitrary children.',
      required: true,
    },
    {
      name: 'maxLines',
      type: 'number',
      description: 'Maximum number of lines to show before clamping with an ellipsis.',
      required: true,
    },
    {
      name: 'hasTooltip',
      type: "boolean | 'above' | 'below' | 'start' | 'end'",
      description: 'Show a tooltip with the full content on hover/focus when clamped. true shows at default position, false disables it, or pass a placement.',
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
      'Clamps arbitrary content to a fixed number of lines with an ellipsis. Text\'s maxLines truncates the text component\'s own string content; LineClamp is the composable version — wrap it around any children (mixed inline content, nested elements) to clamp the whole block to N lines. Truncation detection reuses useTruncation (the same hook Text uses), so overflow is measured correctly even while -webkit-line-clamp clips scrollHeight.',
    bestPractices: [
      { guidance: true, description: 'Use LineClamp when clamping a block of mixed or composed content (not a single Text node).' },
      { guidance: true, description: "Use Text's own maxLines prop when clamping a single Text node — no need to wrap it in LineClamp." },
      { guidance: false, description: 'Disable the tooltip (hasTooltip={false}) when the clamped content is already reachable elsewhere on the page, to avoid a redundant announcement.' },
    ],
  },
};

/** @type {import('../docs-types').ComponentDoc} */
export const docsZh = {
  name: 'LineClamp',
  displayName: 'Line Clamp',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: '要截断的内容。与 Text 的 maxLines（截断单个文本节点）不同，LineClamp 包裹任意子节点。',
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
      description: '截断时在悬停/聚焦显示完整内容的工具提示。true 为默认位置显示，false 禁用，或传入具体位置。',
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
      '将任意内容截断为固定行数并显示省略号。Text 的 maxLines 截断其自身的字符串内容；LineClamp 是可组合版本 —— 用它包裹任意子节点（混合内联内容、嵌套元素）即可将整个区块截断为 N 行。',
    bestPractices: [
      { guidance: true, description: '当需要截断混合或组合内容（而非单个 Text 节点）时使用 LineClamp。' },
      { guidance: true, description: '截断单个 Text 节点时使用 Text 自身的 maxLines 属性，无需用 LineClamp 包裹。' },
      { guidance: false, description: '当截断内容已在页面其他位置可访问时，禁用工具提示（hasTooltip={false}）以避免重复播报。' },
    ],
  },
};

/** @type {import('../docs-types').TranslationDoc} */
export const docsDense = {
  description:
    'Clamps arbitrary content to N lines with an ellipsis; composable version of Text maxLines.',
  usage: {
    description:
      'Wrap any children (mixed inline content, nested elements) to clamp the whole block to N lines. Reuses useTruncation for overflow detection.',
    bestPractices: [
      { guidance: true, description: 'Use for clamping a block of mixed/composed content, not a single Text node.' },
      { guidance: true, description: "Use Text's own maxLines for a single Text node instead." },
      { guidance: false, description: 'Disable tooltip when content is reachable elsewhere, to avoid redundant announcement.' },
    ],
  },
  propDescriptions: {
    children: 'Content to clamp. Composable version of maxLines — wraps arbitrary children.',
    maxLines: 'Max lines before clamping with ellipsis.',
    hasTooltip: 'Tooltip with full content when clamped. true/false/placement.',
    as: "HTML element to render. Default 'div'.",
  },
};
