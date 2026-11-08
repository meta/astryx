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
        'Content to clamp: mixed inline content, nested elements, anything you would rather not wrap in a single Text.',
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
      name: 'hasTruncateTooltip',
      type: 'boolean',
      description:
        "Show a tooltip with the full text content on hover or keyboard focus when clamped. A clamped root is focusable (tabindex 0) so keyboard users can reach the tooltip; a tabIndex you pass wins. The tooltip props follow Text's: when Text's hasTruncateTooltip is renamed in a minor, LineClamp follows.",
      default: 'true',
    },
    {
      name: 'truncateTooltipPlacement',
      type: "'above' | 'below' | 'start' | 'end'",
      description: 'Where the truncation tooltip opens.',
      default: "'above'",
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
      "Clamps arbitrary content to a fixed number of lines with an ellipsis. Text's maxLines clamps a Text element; LineClamp clamps whatever it wraps and adds no typography of its own, so it suits mixed inline content and nested elements without changing their font, color or wrapping. Truncation detection reuses useTruncation (the same hook Text uses), so overflow is measured correctly even while -webkit-line-clamp clips scrollHeight.",
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
        guidance: true,
        description:
          'Disable the tooltip (hasTruncateTooltip={false}) when the clamped content is already reachable elsewhere on the page, to avoid a redundant announcement.',
      },
      {
        guidance: true,
        description:
          "LineClamp makes a focusable descendant inert only when both hold: (1) it is in the clamp's own flow. A positioned element is in that flow when its containing block is an element inside the clamp that is itself in the flow, as a control's own positioned wrapper is; the line test then applies to that containing block's box. A fixed element, an absolute element whose containing block is the clamp itself or lies outside it, a top-layer element (a popover or dialog), and anything rendered elsewhere through a portal each start a subtree that is never made inert, at any depth. (2) its box lies wholly beyond the clamp's last visible line. A control any part of which is visible stays reachable. A focusable with no box when LineClamp checks is treated as beyond the last line until it gains a box; LineClamp re-checks then. LineClamp re-checks when its size, its content or its fonts change. Gap: an absolutely placed control that the clamp itself clips stays a tab stop; the author owns positioned content inside a clamp. Inert takes such a control out of the Tab order and the accessibility tree. LineClamp never rewrites your own tabIndex or aria-hidden, and the element that holds focus is never made inert.",
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
      name: 'hasTruncateTooltip',
      type: 'boolean',
      description:
        '截断时在悬停或键盘聚焦时显示完整文本的工具提示；被截断的根元素可聚焦（tabindex 0），你传入的 tabIndex 优先。工具提示相关属性与 Text 保持一致：Text 的 hasTruncateTooltip 在次版本中改名时，LineClamp 随之改名。',
      default: 'true',
    },
    {
      name: 'truncateTooltipPlacement',
      type: "'above' | 'below' | 'start' | 'end'",
      description: '截断工具提示的打开位置。',
      default: "'above'",
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
        guidance: true,
        description:
          '当截断内容已在页面其他位置可访问时，禁用工具提示（hasTruncateTooltip={false}）以避免重复播报。',
      },
      {
        guidance: true,
        description:
          '只有同时满足以下两点时，LineClamp 才会把可聚焦的后代设为 inert：(1) 它在截断容器自己的文档流中。若定位元素的包含块是容器内同样处于文档流中的元素（例如控件自己的定位包装元素），该定位元素也算在文档流中，此时按该包含块的盒子判断是否越过最后一行。fixed 元素、包含块是容器本身或位于容器之外的 absolute 元素、顶层元素（popover 或 dialog），以及通过 portal 渲染到别处的内容，各自开启一个无论多深都不会被设为 inert 的子树。(2) 它的盒子完全位于最后一个可见行之外。只要有一部分可见，控件就保持可达。检查时没有盒子的可聚焦元素会被视为位于最后一行之外，直到它获得盒子；届时 LineClamp 会重新检查。LineClamp 会在尺寸、内容或字体变化时重新检查。已知缺口：被容器本身截断的绝对定位控件仍是一个 Tab 停靠点；容器内的定位内容由作者负责。LineClamp 不会改写你自己设置的 tabIndex 或 aria-hidden，持有焦点的元素也不会被设为 inert。',
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
        guidance: true,
        description:
          'Disable tooltip when content is reachable elsewhere, to avoid redundant announcement.',
      },
      {
        guidance: true,
        description:
          "Inert only for a focusable in the clamp's own flow whose box lies wholly past the last visible line (a positioned element placed against an in-flow containing block in the clamp, like a control's own wrapper, is in the flow and judged by that block's box); never inside a fixed, escaping absolute, top-layer or portaled subtree; a partly visible control stays reachable; a focusable with no box counts as past the last line until it gains a box; re-checked on size, content and font changes. Gap: an absolutely placed control the clamp clips stays a tab stop. Never the focused element, never your own tabIndex or aria-hidden.",
      },
    ],
  },
  propDescriptions: {
    children:
      'Content to clamp. Composable version of maxLines — wraps arbitrary children.',
    maxLines: 'Max lines before clamping with ellipsis.',
    hasTruncateTooltip:
      "Tooltip with full text on hover or focus when clamped. Clamped root is focusable. Follows Text's prop name.",
    truncateTooltipPlacement: "Tooltip placement. Default 'above'.",
    as: "HTML element to render. Default 'div'.",
  },
};
