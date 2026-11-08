// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Heading',
  subComponentOf: 'Text',
  displayName: 'Heading',
  description:
    'Semantic heading component that renders h1-h6 elements with themed styling, themed sizing via type scale tokens, and line-clamp truncation.',
  theming: {
    targets: [
      {
        className: 'astryx-heading',
        visualProps: ['level', 'color', 'type', 'weight'],
      },
    ],
  },
  props: [
    {
      name: 'level',
      type: '1 | 2 | 3 | 4 | 5 | 6',
      description:
        'Heading level. Determines the semantic HTML element (h1-h6) and the visual styling from the theme (unless `type` is set).',
      required: true,
    },
    {
      name: 'type',
      type: "'display-1' | 'display-2' | 'display-3'",
      description:
        'Display type variant. Overrides the visual styling from `level` with display-scale sizing (larger, lighter weight, tighter line-height). Themes may add custom visual types. The `level` still determines the HTML element for accessibility. Use for hero banners, marketing headlines, and data callouts.',
    },
    {
      name: 'weight',
      type: "'normal' | 'medium' | 'semibold' | 'bold'",
      description:
        'Explicit font-weight override. Wins over the selected visual type or heading-level default.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Heading content.',
      required: true,
    },
    {
      name: 'accessibilityLevel',
      type: '1 | 2 | 3 | 4 | 5 | 6',
      description:
        'Accessibility level override. When set and different from `level`, applies `aria-level` so the document outline differs from the visual style.',
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'disabled' | 'placeholder' | 'accent' | 'inherit'",
      description: 'Text color. Themes may add custom colors.',
      default: "'primary'",
    },
    {
      name: 'display',
      type: "'inline' | 'block'",
      description:
        "Display type. Silently overridden to 'block' when maxLines > 0 or hasCapsize is true.",
      default: "'block'",
    },
    {
      name: 'maxLines',
      type: 'number',
      description:
        'Maximum lines before truncation. 0 means no truncation. When set, shows a tooltip on hover if content is truncated.',
      default: '0',
    },
    {
      name: 'hasTruncateTooltip',
      type: "boolean | 'above' | 'below' | 'start' | 'end'",
      description:
        "Controls tooltip behavior for truncated text. true shows the tooltip at the default position, false disables it, or a placement string ('above' | 'below' | 'start' | 'end') sets a specific position.",
      default: 'true',
    },
    {
      name: 'wordBreak',
      type: "'break-word' | 'break-all'",
      description:
        "Word break behavior when truncating. Defaults to 'break-all' for single-line truncation, 'break-word' otherwise. Without truncation, a token longer than its line (a URL, an ID) wraps (`overflow-wrap: break-word`), so in ordinary flow text does not make the page scroll sideways. Inside a flex row, give the flex child `min-width: 0` so it can shrink. A container you style with `overflow-wrap: anywhere` does not reach this text; Astryx's own containers pass their wrap through.",
    },
    {
      name: 'textWrap',
      type: "'wrap' | 'nowrap' | 'balance' | 'pretty'",
      description: 'Text wrapping behavior.',
    },
    {
      name: 'justify',
      type: "'start' | 'center' | 'end'",
      description:
        'Text alignment (justification). Uses logical values (start/end) for i18n/RTL compatibility.',
      default: "'start'",
    },
    {
      name: 'hasCapsize',
      type: 'boolean',
      description:
        'Enable optical alignment using text-box-trim. Forces block display.',
      default: 'false',
    },
    {
      name: 'hasStrikethrough',
      type: 'boolean',
      description: 'Apply strikethrough text decoration.',
      default: 'false',
    },
    {
      name: 'id',
      type: 'string',
      description: 'HTML id attribute.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles applied to the heading element. Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name applied to the heading element.',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description:
        'Inline styles applied to the heading element. When `maxLines` is above 1, its line clamp replaces any `WebkitLineClamp` in `style`.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLHeadingElement>',
      description: 'Ref forwarded to the heading element.',
    },
  ],
};

export const docsZh = {
  name: 'Heading',
  displayName: 'Heading',
  description:
    '语义化标题组件，渲染带主题样式的 h1–h6 元素，支持可选的编辑风格比例和行截断。',
  props: [
    {
      name: 'level',
      type: '1 | 2 | 3 | 4 | 5 | 6',
      description:
        '标题级别。决定语义 HTML 元素（h1–h6）和来自主题的样式（除非设置了 `type`）。',
      required: true,
    },
    {
      name: 'type',
      type: "'display-1' | 'display-2' | 'display-3'",
      description:
        '展示类型变体。用展示级别的大小（更大、更轻的字重、更紧的行高）覆盖来自 `level` 的视觉样式。主题可以添加自定义视觉类型。`level` 仍然决定用于无障碍的 HTML 元素。用于英雄横幅、营销标题和数据提示。',
    },
    {
      name: 'weight',
      type: "'normal' | 'medium' | 'semibold' | 'bold'",
      description: '显式字重覆盖。优先于所选视觉类型或标题级别的默认值。',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: '标题内容。',
      required: true,
    },
    {
      name: 'accessibilityLevel',
      type: '1 | 2 | 3 | 4 | 5 | 6',
      description:
        '无障碍级别覆盖。当设置且与 `level` 不同时，应用 `aria-level` 使文档大纲与视觉样式不同。',
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'disabled' | 'placeholder' | 'accent' | 'inherit'",
      description: '文本颜色。主题可添加自定义颜色。',
      default: "'primary'",
    },
    {
      name: 'display',
      type: "'inline' | 'block'",
      description:
        "显示类型。当 maxLines > 0 或 hasCapsize 为 true 时，会静默覆盖为 'block'。",
      default: "'block'",
    },
    {
      name: 'maxLines',
      type: 'number',
      description:
        '截断前的最大行数。0 表示不截断。设置后，如果内容被截断，悬停时会显示工具提示。',
      default: '0',
    },
    {
      name: 'hasTruncateTooltip',
      type: "boolean | 'above' | 'below' | 'start' | 'end'",
      description:
        "控制截断文本的工具提示行为。true 在默认位置显示工具提示，false 禁用它，或者放置字符串 ('above' | 'below' | 'start' | 'end') 设置特定位置。",
      default: 'true',
    },
    {
      name: 'wordBreak',
      type: "'break-word' | 'break-all'",
      description:
        "截断时的断词行为。单行截断默认为 'break-all'，其他情况默认为 'break-word'。不截断时，超过一行宽度的长串（如 URL、ID）会换行（`overflow-wrap: break-word`），因此在普通文档流中文本不会让页面横向滚动。在 flex 行中，请为 flex 子元素设置 `min-width: 0` 以便其收缩。你自己设置了 `overflow-wrap: anywhere` 的容器不会作用于此文本；Astryx 自带的容器会传递其换行方式。",
    },
    {
      name: 'textWrap',
      type: "'wrap' | 'nowrap' | 'balance' | 'pretty'",
      description: '文本换行行为。',
    },
    {
      name: 'justify',
      type: "'start' | 'center' | 'end'",
      description:
        '文本对齐（两端对齐）。使用逻辑值（start/end）以兼容 i18n/RTL。',
      default: "'start'",
    },
    {
      name: 'hasCapsize',
      type: 'boolean',
      description: '使用 text-box-trim 启用光学对齐。强制块级显示。',
      default: 'false',
    },
    {
      name: 'hasStrikethrough',
      type: 'boolean',
      description: '应用删除线文本装饰。',
      default: 'false',
    },
    {
      name: 'id',
      type: 'string',
      description: 'HTML id 属性。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '应用于标题元素的 StyleX 样式。必须是 stylex.create() 的值，而不是 style={{}} 这样的内联样式对象。',
    },
    {
      name: 'className',
      type: 'string',
      description: '应用于标题元素的 CSS 类名。',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description:
        '应用于标题元素的内联样式。当 `maxLines` 大于 1 时，其行数截断会替换 `style` 中的 `WebkitLineClamp`。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLHeadingElement>',
      description: '转发到标题元素的 Ref。',
    },
  ],
};

export const docsDense = {
  name: 'Heading',
  displayName: 'Heading',
  description:
    'Semantic h1–6 w/ themed styling, themed sizing via type scale tokens, line-clamp truncation.',
  propDescriptions: {
    level:
      'Heading level; determines HTML element + styling from theme (unless type is set).',
    type: 'Display variant (display-1/2/3 or a theme-owned custom type); overrides visual styling from level.',
    weight:
      'Explicit font weight; wins over the visual type or heading-level default.',
    children: 'Heading content.',
    accessibilityLevel:
      'aria-level override when different from level for document outline.',
    color: 'Text color. Themes may add custom colors.',
    display:
      "Display type; overridden to 'block' when maxLines>0 or hasCapsize.",
    maxLines:
      'Max lines before truncation; 0=none. Shows tooltip if truncated.',
    hasTruncateTooltip:
      "Tooltip for truncated text; true=default position, false=disabled, or a placement ('above' | 'below' | 'start' | 'end').",
    wordBreak:
      "Word break behavior when truncating; defaults 'break-all' for single-line, 'break-word' otherwise. Untruncated long tokens wrap (overflow-wrap: break-word); a flex child needs min-width: 0; your own container's overflow-wrap: anywhere does not reach this text (Astryx containers pass theirs through).",
    textWrap: 'Text wrapping behavior.',
    justify:
      "Text alignment (justification); logical values 'start' | 'center' | 'end' for RTL.",
    hasCapsize: 'Optical alignment via text-box-trim; forces block display.',
    hasStrikethrough: 'Strikethrough text decoration.',
    id: 'HTML id attribute.',
    xstyle: 'StyleX styles on the heading; stylex.create() value only.',
    className: 'CSS class on the heading.',
    style:
      'inline styles on the heading; with maxLines>1 the line clamp replaces WebkitLineClamp.',
    ref: 'ref to the heading element.',
  },
};
