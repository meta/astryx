// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Spinner',
  displayName: 'Spinner',
  category: 'Feedback & Status',
  keywords: ["spinner","loader","loading","circular","progress","spin","activity","busy","indeterminate","circularprogress"],
  props: [
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg' | 'xl'",
      description: 'Spinner size: ring diameter (10px, 14px, 18px, 28px).',
      default: "'md'",
    },
    {
      name: 'shade',
      type: "'default' | 'onMedia' | 'subtle' | 'inherit'",
      description: 'Color shade for light or dark backgrounds.',
      default: "'default'",
    },
    {
      name: 'label',
      type: 'ReactNode',
      description:
        'Visible content below the spinner. String labels auto-set aria-label.',
    },
    {
      name: 'aria-label',
      type: 'string',
      description:
        'Accessible name for screen readers. Defaults to label (if string) or a translated "Loading" from the i18n catalog.',
      default: "'Loading'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],  theming: {
    targets: [
      {className: 'astryx-spinner', visualProps: ['size', 'shade']},
    ],
    vars: [
      {name: '--spinner-diameter', description: "Diameter of the drawn ring. Set it on a size-variant target to retheme what each named size resolves to, e.g. spinner: { 'size:xl': { '--spinner-diameter': '2.5rem' } }. The rendered box is this plus the stroke width on each side, and follows automatically. Any length works: rem, em and calc() are resolved before the ring is drawn.", default: '10px (sm), 14px (md), 18px (lg), 28px (xl)'},
      {name: '--spinner-stroke-width', description: 'Stroke width of both circles the ring is drawn from: the moving arc and the track behind it. Set it per size alongside the diameter. One stroke width drives both, so 0 is honoured as a zero-width stroke and paints nothing at all rather than falling back to the default; for an arc with no track behind it, set --spinner-track-color to transparent instead.', default: '2px (sm), 3px (md), 3px (lg), 4px (xl)'},
      {name: '--spinner-color', description: "Color of the moving arc. Defaults to the shade's token, so set it on a shade-variant target to retheme one shade (spinner: { 'shade:subtle': { '--spinner-color': 'var(--color-text-tertiary)' } }), or on the base target to retheme all four. Accepts any color notation, including var(), color-mix() and currentColor.", default: 'var(--color-accent) (default), var(--color-text-secondary) (subtle), var(--color-on-dark) (onMedia), currentColor (inherit)'},
      {name: '--spinner-track-color', description: 'Color of the track the arc travels on. Set it to `transparent` for an arc with no track. The onMedia and inherit shades draw the track at reduced alpha (30%) so it reads against an arbitrary backdrop; that fade applies to a themed color too.', default: 'var(--color-track) (default, subtle), var(--color-on-dark) (onMedia), currentColor (inherit)'},
      {name: '--spinner-arc-fraction', description: "Fraction of the ring the moving arc covers, as a plain number (not a percentage or angle). Set it on a size-variant target the same way as --spinner-diameter, e.g. spinner: { 'size:xl': { '--spinner-arc-fraction': '0.75' } } for a 270deg sweep. Only takes effect once the stylesheet loads; a render with no CSS (SSR, no-JS) always draws the default 135deg arc.", default: '0.375 (135deg), same for every size'},
    ],
  },
  usage: {
    description:
      'An animated loading indicator for processes with unknown duration, such as data fetching or form submission. Supports visible labels, multiple sizes, and a dark background variant. For content with known dimensions, use Skeleton instead.',
    bestPractices: [
      {guidance: true, description: 'Provide a meaningful label to describe what is loading for screen reader users.'},
      {guidance: true, description: 'Use the "onMedia" shade when placed on dark or accent-colored backgrounds.'},
      {guidance: false, description: 'Use for content areas with known dimensions; use Skeleton to preserve layout instead.'},
      {guidance: false, description: 'Stack multiple spinners in the same view; use one to represent the overall loading state.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Spinner',
  displayName: 'Spinner',
  props: [
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg' | 'xl'",
      description: '旋转器尺寸——环直径（10px、14px、18px、28px）。',
      default: "'md'",
    },
    {
      name: 'shade',
      type: "'default' | 'onMedia' | 'subtle' | 'inherit'",
      description: '浅色或深色背景的颜色色调。',
      default: "'default'",
    },
    {
      name: 'label',
      type: 'ReactNode',
      description: '旋转器下方的可见内容。字符串标签自动设置 aria-label。',
    },
    {
      name: 'aria-label',
      type: 'string',
      description: '屏幕阅读器的无障碍名称。默认为 label（如果是字符串）或来自 i18n 词条的已翻译 "Loading"。',
      default: "'Loading'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX 样式，用于布局自定义（边距、定位、尺寸）。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-spinner', visualProps: ['size', 'shade']},
    ],
    vars: [
      {name: '--spinner-diameter', description: "绘制环的直径。在尺寸变体目标上设置，以重新定义每个命名尺寸的解析值，例如 spinner: { 'size:xl': { '--spinner-diameter': '2.5rem' } }。渲染盒子的尺寸为该值加上两侧的描边宽度，并自动跟随。支持任意长度单位——rem、em 与 calc() 会在绘制前解析。", default: '10px (sm), 14px (md), 18px (lg), 28px (xl)'},
      {name: '--spinner-stroke-width', description: '绘制环的两个圆——移动圆弧与其后的轨道——的描边宽度。与直径一起按尺寸设置。同一个描边宽度同时驱动两者，因此 0 会被采纳为零宽描边——什么都不绘制，而不会回退到默认值；若想要没有轨道的圆弧，请改将 --spinner-track-color 设为 transparent。', default: '2px (sm), 3px (md), 3px (lg), 4px (xl)'},
      {name: '--spinner-color', description: "运动圆弧的颜色。默认取所在 shade 的令牌，因此可在 shade 变体目标上设置以重新定义单个 shade——spinner: { 'shade:subtle': { '--spinner-color': 'var(--color-text-tertiary)' } }——或在 base 目标上设置以覆盖全部四种。接受任意颜色写法，包括 var()、color-mix() 与 currentColor。", default: 'var(--color-accent)（default）、var(--color-text-secondary)（subtle）、var(--color-on-dark)（onMedia）、currentColor（inherit）'},
      {name: '--spinner-track-color', description: '圆弧所在轨道的颜色。设为 `transparent` 可得到无轨道的圆弧。onMedia 与 inherit 两种 shade 会以降低的透明度（30%）绘制轨道，以便在任意背景上可辨；该淡化同样作用于主题化的颜色。', default: 'var(--color-track)（default、subtle）、var(--color-on-dark)（onMedia）、currentColor（inherit）'},
      {name: '--spinner-arc-fraction', description: "运动圆弧覆盖圆环的比例，为纯数字（非百分比或角度）。在尺寸变体目标上设置，方式与 --spinner-diameter 相同，例如 spinner: { 'size:xl': { '--spinner-arc-fraction': '0.75' } } 可得到 270 度的圆弧。仅在样式表加载后生效；无 CSS 的渲染（SSR、无 JS）始终绘制默认的 135 度圆弧。", default: '0.375（135 度），各尺寸相同'},
    ],
  },
  usage: {
    description:
      'An animated loading indicator for processes with unknown duration, such as data fetching or form submission. Supports visible labels, multiple sizes, and a dark background variant. For content with known dimensions, use Skeleton instead.',
    bestPractices: [
      {guidance: true, description: 'Provide a meaningful label to describe what is loading for screen reader users.'},
      {guidance: true, description: 'Use the "onMedia" shade when placed on dark or accent-colored backgrounds.'},
      {guidance: false, description: 'Use for content areas with known dimensions; use Skeleton to preserve layout instead.'},
      {guidance: false, description: 'Stack multiple spinners in the same view; use one to represent the overall loading state.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  usage: {
    description:
      'An animated loading indicator for processes with unknown duration, such as data fetching or form submission. Supports visible labels, multiple sizes, and a dark background variant. For content with known dimensions, use Skeleton instead.',
    bestPractices: [
      {guidance: true, description: 'Provide a meaningful label to describe what is loading for screen reader users.'},
      {guidance: true, description: 'Use the "onMedia" shade when placed on dark or accent-colored backgrounds.'},
      {guidance: false, description: 'Use for content areas with known dimensions; use Skeleton to preserve layout instead.'},
      {guidance: false, description: 'Stack multiple spinners in the same view; use one to represent the overall loading state.'},
    ],
  },
  propDescriptions: {
    size: 'Spinner size: ring diameter (10px, 14px, 18px, 28px).',
    shade: 'Color shade for light or dark backgrounds.',
    label: 'Visible content below spinner. String auto-sets aria-label.',
    'aria-label':
      'A11y name for screen readers. Defaults to label or a translated "Loading".',
    xstyle: 'StyleX styles for layout customization. Must be stylex.create() value, not inline style.',
  },
};