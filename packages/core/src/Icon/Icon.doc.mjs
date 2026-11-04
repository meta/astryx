// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Glyph',
    required: true,
    description: 'Visual symbol rendered for the selected icon.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Icon',
  displayName: 'Icon',
  category: 'Content',
  keywords: [
    'icon',
    'svg',
    'glyph',
    'symbol',
    'pictogram',
    'graphic',
    'vector',
    'arrow',
    'chevron',
    'caret',
    'checkmark',
    'cross',
    'gear',
    'cog',
    'broom',
    'sparkle',
    'sparkles',
    'star',
    'heart',
    'bell',
    'trash',
    'pencil',
    'magnifyingglass',
    'paperclip',
    'house',
    'flame',
    'rocket',
    'lightning',
    'bolt',
    'globe',
    'sun',
    'moon',
    'bookmark',
    'thumbsup',
    'smiley',
    'emoji',
    'lock',
    'eye',
    'cloud',
    'hourglass',
    'trophy',
    'gift',
    'camera',
  ],
  playground: {
    // `icon` is required and its type can't be auto-generated, so the
    // properties-tab preview showed "Missing: icon". Seed a valid semantic
    // icon name so the interactive preview renders.
    defaults: {
      icon: 'search',
    },
  },
  props: [
    {
      name: 'icon',
      type: 'IconName | ComponentType<SVGProps>',
      description:
        'Semantic icon name or SVG component. Valid semantic names: close, chevronDown, chevronLeft, chevronRight, chevronsLeft, chevronsRight, check, success, error, warning, info, calendar, clock, externalLink, menu, moreHorizontal, search, upload, arrowUp, arrowDown, arrowsUpDown, funnel, eyeSlash, viewColumns, copy, checkDouble, wrench, stop, microphone. For any icon not in this list, pass an SVG component directly (e.g. import from lucide-react or @heroicons/react). Note: this prop is called `icon`, not `name`.',
      required: true,
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'tertiary' | 'disabled' | 'accent' | 'info' | 'success' | 'error' | 'warning' | 'inherit'",
      description: 'Color variant mapped to Astryx icon color tokens.',
      default: "'inherit'",
    },
    {
      name: 'size',
      type: "'xsm' | 'sm' | 'md' | 'lg'",
      description:
        "Icon size. xsm, sm, md, and lg are 12, 16, 20, and 24px at a 16px root and scale with the root font size; a theme sets a size's glyph dimension with width and height, in px or rem, on components.icon['size:sm'] (and the other sizes). An explicit value wins. When omitted, Icon uses the nearest default supplied by an owning Astryx component for its icon slot, then falls back to md when no contextual default exists.",
      default: "Contextual; otherwise 'md'",
    },
    {
      name: 'variant',
      type: 'IconVariant',
      description:
        "Requests the active theme's alternate artwork for a semantic icon name, such as 'filled'. Names come from IconVariantMap, which an application augments from @astryxdesign/core/Icon; Astryx defines none. The theme's icon entry receives the variant only when the active theme lists it in iconVariants (and, for an entry the theme inherited, the theme that defined the entry lists it too); otherwise it draws its normal artwork. Ignored by an icon component passed directly. Selects artwork only: it is not written to the DOM and has no theming selector.",
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible name for a MEANINGFUL, standalone icon (a status glyph or icon-only indicator with no adjacent text). Setting it exposes the icon to screen readers as role="img" with this text as the accessible name (aria-label) and removes the default aria-hidden. Omit it (default) for decorative icons and the icon stays hidden from assistive tech (aria-hidden="true"). This is the accessible-name / alt-text prop for icons: one prop instead of manually setting aria-label + role + aria-hidden. An empty string is treated as decorative. Do not set it when an interactive parent (Button, IconButton, link) already names the control.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        "StyleX styles for customization (color, size, opacity). Folded into the icon's own stylex.props() call so it composes with the base color/size styles. Must be a stylex.create() value, not an inline style object like style={{}}.",
    },
  ],
  theming: {
    targets: [{className: 'astryx-icon', visualProps: ['color', 'size']}],
    vars: [
      {
        name: '--_icon-width',
        description:
          'Glyph width for the size; set by width on the icon target',
        default: '0.75rem, 1rem, 1.25rem, or 1.5rem by size',
        private: true,
      },
      {
        name: '--_icon-height',
        description:
          'Glyph height for the size; set by height on the icon target',
        default: '0.75rem, 1rem, 1.25rem, or 1.5rem by size',
        private: true,
      },
    ],
    derived: [
      {property: 'width', vars: ['--_icon-width'], replaces: true},
      {property: 'height', vars: ['--_icon-height'], replaces: true},
    ],
  },
  usage: {
    description:
      'Icons are small visual symbols that represent actions, objects, or concepts. They improve scannability and reinforce meaning alongside text. Supports both direct SVG components and semantic icon names that adapt to the active theme.',
    anatomy,
    bestPractices: [
      {
        guidance: true,
        description:
          'Use semantic icon names when available; they adapt to theme changes automatically.',
      },
      {
        guidance: true,
        description:
          "Override icons through the theme, not globally: defineTheme({icons: {close: <XMarkIcon />}}) scopes the swap to the active <Theme>, and extends shallow-merges it into derived themes. registerIcons() mutates a process-wide registry and warns in dev, so keep it for app bootstrap rather than making it a library's theming seam.",
      },
      {
        guidance: true,
        description:
          "To match artwork to the rendered size, make a theme or registered icon entry a pure, synchronous function of {size, variant}: defineTheme({icons: {info: ({size}) => <InfoIcon weight={size === 'sm' ? 'bold' : 'regular'} />}}). Icon passes the size it renders at; getIcon(), useIcon(), getIconRegistry() and theme.icons read the function at size md. A function that returns null draws nothing instead of falling back to the default icon. Do not use hooks, measure the DOM, or read browser or mutable state inside it.",
      },
      {
        guidance: true,
        description:
          'Pair icons with text labels for accessibility; icon-only elements need an accessible label.',
      },
      {
        guidance: true,
        description:
          'For a meaningful standalone icon (no adjacent text), give it an accessible name via the `label` prop: it sets role="img" + aria-label and unhides the icon.',
      },
      {
        guidance: true,
        description:
          'Use color tokens for icon colors, not hardcoded hex values.',
      },
      {
        guidance: true,
        description:
          'Be mindful of context; decorative icons in compact components can distract rather than help.',
      },
      {
        guidance: false,
        description:
          'Use icons as the sole means of conveying meaning; always provide a text alternative.',
      },
      {
        guidance: false,
        description:
          'Resize icons with arbitrary pixel values; use the provided size props.',
      },
      {
        guidance: false,
        description:
          'Mix icon styles (e.g. outline and filled) within the same context.',
      },
      {
        guidance: false,
        description:
          'Render raw SVG elements; always wrap in Icon for consistent sizing and color.',
      },
      {
        guidance: false,
        description:
          'Pass a `name` prop; Icon uses `icon` (not `name`) to specify which icon to render.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Icon',
  displayName: 'Icon',
  props: [
    {
      name: 'icon',
      type: 'IconName | ComponentType<SVGProps>',
      description:
        '语义图标名称或 SVG 组件。有效语义名称：close, chevronDown, chevronLeft, chevronRight, chevronsLeft, chevronsRight, check, success, error, warning, info, calendar, clock, externalLink, menu, moreHorizontal, search, upload, arrowUp, arrowDown, arrowsUpDown, funnel, eyeSlash, viewColumns, copy, checkDouble, wrench, stop, microphone。列表之外的图标请直接传入 SVG 组件。',
      required: true,
    },
    {
      name: 'color',
      type: "'primary' | 'secondary' | 'tertiary' | 'disabled' | 'accent' | 'info' | 'success' | 'error' | 'warning' | 'inherit'",
      description: '映射到 Astryx 图标颜色令牌的颜色变体。',
      default: "'inherit'",
    },
    {
      name: 'size',
      type: "'xsm' | 'sm' | 'md' | 'lg'",
      description:
        "图标尺寸。xsm、sm、md、lg 在 16px 根字号下分别为 12、16、20、24px，并随根字号缩放；主题在 components.icon['size:sm']（及其他尺寸）上以 px 或 rem 设置 width 和 height，即可决定该尺寸的图标尺寸。显式值优先。省略时，Icon 使用最近的 Astryx 所属组件为其图标槽提供的默认尺寸；如果没有上下文默认值，则回退为 md。",
      default: "上下文默认值；否则为 'md'",
    },
    {
      name: 'variant',
      type: 'IconVariant',
      description:
        "为语义图标名称请求当前主题的替代图稿，例如 'filled'。名称来自 IconVariantMap，由应用从 @astryxdesign/core/Icon 扩充；Astryx 本身不定义任何名称。只有当前主题在 iconVariants 中列出该变体时（对于主题继承来的条目，还需定义该条目的主题也列出它），主题的图标条目才会收到它；否则绘制常规图稿。直接传入的图标组件会忽略它。它只选择图稿：不会写入 DOM，也没有主题样式选择器。",
    },
    {
      name: 'label',
      type: 'string',
      description:
        '有含义的独立图标的可访问名称（无相邻文字的状态图标或纯图标指示器）。设置后会将图标以 role="img" 暴露给辅助技术，并以该文本作为可访问名称（aria-label），同时移除默认的 aria-hidden。省略（默认）用于装饰性图标，图标对辅助技术保持隐藏（aria-hidden="true"）。空字符串按装饰性处理。当交互式父元素（Button、IconButton、链接）已命名该控件时请勿设置。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于自定义的 StyleX 样式（颜色、尺寸、不透明度）。会并入图标自身的 stylex.props() 调用，从而与基础的颜色/尺寸样式组合。必须是 stylex.create() 的值，而不是像 style={{}} 这样的内联样式对象。',
    },
  ],
  theming: {
    targets: [{className: 'astryx-icon', visualProps: ['color', 'size']}],
    vars: [
      {
        name: '--_icon-width',
        description: '该尺寸的图标宽度；由 icon 目标上的 width 设置',
        default: '按尺寸为 0.75rem、1rem、1.25rem 或 1.5rem',
        private: true,
      },
      {
        name: '--_icon-height',
        description: '该尺寸的图标高度；由 icon 目标上的 height 设置',
        default: '按尺寸为 0.75rem、1rem、1.25rem 或 1.5rem',
        private: true,
      },
    ],
    derived: [
      {property: 'width', vars: ['--_icon-width'], replaces: true},
      {property: 'height', vars: ['--_icon-height'], replaces: true},
    ],
  },
  usage: {
    description:
      'Icons are small visual symbols that represent actions, objects, or concepts. They improve scannability and reinforce meaning alongside text. Supports both direct SVG components and semantic icon names that adapt to the active theme.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use semantic icon names when available; they adapt to theme changes automatically.',
      },
      {
        guidance: true,
        description:
          'Pair icons with text labels for accessibility; icon-only elements need an accessible label.',
      },
      {
        guidance: true,
        description:
          'Use color tokens for icon colors, not hardcoded hex values.',
      },
      {
        guidance: true,
        description:
          'Be mindful of context; decorative icons in compact components can distract rather than help.',
      },
      {
        guidance: false,
        description:
          'Use icons as the sole means of conveying meaning; always provide a text alternative.',
      },
      {
        guidance: false,
        description:
          'Resize icons with arbitrary pixel values; use the provided size props.',
      },
      {
        guidance: false,
        description:
          'Mix icon styles (e.g. outline and filled) within the same context.',
      },
      {
        guidance: false,
        description:
          'Render raw SVG elements; always wrap in Icon for consistent sizing and color.',
      },
      {
        guidance: false,
        description:
          'Pass a `name` prop; Icon uses `icon` (not `name`) to specify which icon to render.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Renders icons w/ Astryx design system colors + sizes. Supports direct SVG icon components + semantic icon names that adapt to active theme.',
  usage: {
    description:
      'Icons are small visual symbols that represent actions, objects, or concepts. They improve scannability and reinforce meaning alongside text. Supports both direct SVG components and semantic icon names that adapt to the active theme.',
    anatomy,
    bestPractices: [
      {
        guidance: true,
        description:
          'Use semantic icon names when available; they adapt to theme changes automatically.',
      },
      {
        guidance: true,
        description:
          'Override icons via theme, not globally: defineTheme({icons: {close: <XMarkIcon />}}) scopes the swap to the active <Theme>; extends shallow-merges into derived themes. registerIcons() mutates a global registry and warns in dev: app bootstrap only, not a library theming seam.',
      },
      {
        guidance: true,
        description:
          "Size-aware artwork: a theme/registered entry may be a pure sync function of {size, variant}, e.g. info: ({size}) => <InfoIcon weight={size === 'sm' ? 'bold' : 'regular'} />. Icon passes its rendered size; getIcon/useIcon/getIconRegistry/theme.icons read it at md. A null result draws nothing (no fallback). No hooks, DOM measurement, or browser/mutable state.",
      },
      {
        guidance: true,
        description:
          'Pair icons with text labels for accessibility; icon-only elements need an accessible label.',
      },
      {
        guidance: true,
        description:
          'For a meaningful standalone icon (no adjacent text), set an accessible name via `label`: sets role="img" + aria-label, unhides icon.',
      },
      {
        guidance: true,
        description:
          'Use color tokens for icon colors, not hardcoded hex values.',
      },
      {
        guidance: true,
        description:
          'Be mindful of context; decorative icons in compact components can distract rather than help.',
      },
      {
        guidance: false,
        description:
          'Use icons as the sole means of conveying meaning; always provide a text alternative.',
      },
      {
        guidance: false,
        description:
          'Resize icons with arbitrary pixel values; use the provided size props.',
      },
      {
        guidance: false,
        description:
          'Mix icon styles (e.g. outline and filled) within the same context.',
      },
      {
        guidance: false,
        description:
          'Render raw SVG elements; always wrap in Icon for consistent sizing and color.',
      },
      {
        guidance: false,
        description:
          '`name` prop, which does not exist. Use `icon` to specify which icon to render.',
      },
    ],
  },
  propDescriptions: {
    icon: 'Semantic icon name or SVG component. Valid names: close, chevronDown, chevronLeft, chevronRight, chevronsLeft, chevronsRight, check, success, error, warning, info, calendar, clock, externalLink, menu, moreHorizontal, search, upload, arrowUp, arrowDown, arrowsUpDown, funnel, eyeSlash, viewColumns, copy, checkDouble, wrench, stop, microphone. For others, pass an SVG component.',
    color: 'Color variant mapped to Astryx icon color tokens.',
    size: "xsm/sm/md/lg = 12/16/20/24px at a 16px root, scale w/ root font size; theme sets a size's glyph dimension via width + height (px or rem) on components.icon['size:sm'] etc. Explicit Icon size; otherwise nearest owning-component default, then 'md' when no contextual default exists",
    variant:
      "Requests the active theme's alternate artwork (e.g. 'filled'); names from augmentable IconVariantMap. Reaches the entry only if the active theme's iconVariants lists it (and an inherited entry's defining theme does too); else normal artwork. Ignored by a directly passed component; never in the DOM; no theming selector.",
    label:
      'Accessible name for a meaningful, standalone icon. Sets role="img" + aria-label and drops the default aria-hidden. Omit (default) for decorative icons (stays aria-hidden). Empty string = decorative. The accessible-name/alt-text prop for icons.',
    xstyle:
      'StyleX styles (color, size, opacity) via stylex.create(); composes with the base color/size styles.',
  },
};
