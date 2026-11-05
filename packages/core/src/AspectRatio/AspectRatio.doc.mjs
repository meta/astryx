// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'AspectRatio',
  displayName: 'Aspect Ratio',
  category: 'Layout',
  keywords: ["aspect-ratio","ratio","proportion","responsive","embed","container","widescreen","thumbnail","letterbox","crop"],
  usage: {
    description:
      'Maintains a fixed width-to-height ratio for its children as its container resizes. Use it for media containers like videos, images, thumbnails, or any content that needs consistent proportions. It takes its width from the container and derives its height from the ratio, so it needs an ancestor with a definite width.',
    bestPractices: [
      {guidance: true, description: 'Express the ratio as a fraction for readability — `ratio={16 / 9}` rather than `ratio={1.78}`. It is a number, so the string form `ratio="16/9"` is a type error.'},
      {guidance: true, description: 'Use for media that needs consistent proportions across screen sizes.'},
      {guidance: true, description: 'Use `fit="cover"` for images and video so the component sizes the child; the child should not repeat `width`/`height`/`objectFit` styles.'},
      {guidance: true, description: 'Pass one child. With `fit` set, every direct child is stretched to fill the box, so put an overlay or caption inside a single wrapper child rather than passing it as a second child.'},
      {guidance: true, description: 'Describe media children with `alt`, or `alt=""` when the image is decorative. AspectRatio adds no role and no accessible name of its own, so the child carries the whole accessible description.'},
      {guidance: true, description: 'For a breakpoint-dependent ratio, override the ratio responsively: pass an `aspectRatio` rule via `xstyle` (StyleX), or override `aspect-ratio` from your own unlayered CSS under a `@media`/`@container` rule; component styles live in the `astryx-base` cascade layer, so unlayered consumer CSS wins. Give an `xstyle` rule a `default` branch alongside the conditional one (`{default: 3, \'@container ...\': \'3 / 2\'}`); with only the conditional branch the ratio is unset outside the query and the box collapses.'},
      {guidance: false, description: 'Use for general layout containers; use standard layout components instead.'},
      {guidance: false, description: 'Nest AspectRatio containers; one level is sufficient.'},
      {guidance: false, description: 'Constrain the height on its own. The width comes from the container, so a `height` or `maxHeight` by itself clamps the box off ratio; pair it with `width: "auto"` to size from the height instead.'},
      {guidance: false, description: 'Place it in a shrink-to-fit parent such as `inline-flex`, `width: fit-content` or a floated box. It contributes no intrinsic width there and collapses to zero.'},
    ],
    anatomy: [
      {name: 'Ratio box', required: true, description: 'The outer element that holds the aspect ratio and clips overflow. Carries the `astryx-aspect-ratio` theme target, and the elliptical clip when `shape` is `ellipse`.'},
      {name: 'Content slot', required: true, description: 'A wrapper that fills the ratio box and positions the child. With `fit` set it also sizes the child; without it the child styles itself.'},
    ],
  },
  props: [
    {
      name: 'ratio',
      type: 'number',
      description: 'Aspect ratio as width/height (e.g. 16/9, 1). Emitted as a class-level declaration (never inline), so `xstyle` rules or unlayered consumer CSS can override it responsively.',
      required: true,
    },
    {
      name: 'shape',
      type: "'rectangle' | 'ellipse'",
      description: 'Container shape. Both respect the `ratio`. `ellipse` clips to an oval (a circle when `ratio={1}`).',
      default: "'rectangle'",
    },
    {
      name: 'fit',
      type: "'cover' | 'contain' | 'center'",
      description: 'How the child is sized inside the ratio box. `cover` fills and crops media, `contain` fills and letterboxes, `center` keeps the natural size centered. When omitted, the child styles itself.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content positioned absolutely to fill the container.',
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  playground: {
    defaults: {
      ratio: 16 / 9,
      children: {__element: 'Center', props: {height: '100%'}, children: {__element: 'Text', props: {color: 'secondary'}, children: '16:9'}},
    },
  },
  theming: {
    targets: [
      {className: 'astryx-aspect-ratio', visualProps: ['shape']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'AspectRatio',
  displayName: 'Aspect Ratio',
  usage: {
    description:
      'Maintains a fixed width-to-height ratio for its children as its container resizes. Use it for media containers like videos, images, thumbnails, or any content that needs consistent proportions. It takes its width from the container and derives its height from the ratio, so it needs an ancestor with a definite width.',
    bestPractices: [
      {guidance: true, description: 'Express the ratio as a fraction for readability — `ratio={16 / 9}` rather than `ratio={1.78}`. It is a number, so the string form `ratio="16/9"` is a type error.'},
      {guidance: true, description: 'Use for media that needs consistent proportions across screen sizes.'},
      {guidance: true, description: 'Use `fit="cover"` for images and video so the component sizes the child; the child should not repeat `width`/`height`/`objectFit` styles.'},
      {guidance: true, description: 'Pass one child. With `fit` set, every direct child is stretched to fill the box, so put an overlay or caption inside a single wrapper child rather than passing it as a second child.'},
      {guidance: true, description: 'Describe media children with `alt`, or `alt=""` when the image is decorative. AspectRatio adds no role and no accessible name of its own, so the child carries the whole accessible description.'},
      {guidance: true, description: 'For a breakpoint-dependent ratio, override the ratio responsively: pass an `aspectRatio` rule via `xstyle` (StyleX), or override `aspect-ratio` from your own unlayered CSS under a `@media`/`@container` rule; component styles live in the `astryx-base` cascade layer, so unlayered consumer CSS wins. Give an `xstyle` rule a `default` branch alongside the conditional one (`{default: 3, \'@container ...\': \'3 / 2\'}`); with only the conditional branch the ratio is unset outside the query and the box collapses.'},
      {guidance: false, description: 'Use for general layout containers; use standard layout components instead.'},
      {guidance: false, description: 'Nest AspectRatio containers; one level is sufficient.'},
      {guidance: false, description: 'Constrain the height on its own. The width comes from the container, so a `height` or `maxHeight` by itself clamps the box off ratio; pair it with `width: "auto"` to size from the height instead.'},
      {guidance: false, description: 'Place it in a shrink-to-fit parent such as `inline-flex`, `width: fit-content` or a floated box. It contributes no intrinsic width there and collapses to zero.'},
    ],
    anatomy: [
      {name: 'Ratio box', required: true, description: 'The outer element that holds the aspect ratio and clips overflow. Carries the `astryx-aspect-ratio` theme target, and the elliptical clip when `shape` is `ellipse`.'},
      {name: 'Content slot', required: true, description: 'A wrapper that fills the ratio box and positions the child. With `fit` set it also sizes the child; without it the child styles itself.'},
    ],
  },
  props: [
    {name: 'ratio', type: 'number', description: '宽高比，以宽/高表示（例如 16/9、1）。以类级声明输出（非内联样式），可通过 `xstyle` 规则或未分层的（unlayered）消费者 CSS 做响应式覆盖。', required: true},
    {
      name: 'shape',
      type: "'rectangle' | 'ellipse'",
      description: '容器形状。两种形状都遵循 `ratio`。`ellipse` 裁剪为椭圆（`ratio={1}` 时为正圆）。',
      default: "'rectangle'",
    },
    {
      name: 'fit',
      type: "'cover' | 'contain' | 'center'",
      description: '子元素在比例框内的布局方式。`cover` 填满并裁剪媒体，`contain` 填满并留边，`center` 保持原始尺寸居中。省略时子元素自行设置样式。',
    },
    {name: 'children', type: 'ReactNode', description: '通过绝对定位填充容器的内容。', required: true},
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，而不是像 style={{}} 这样的内联样式对象。',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-aspect-ratio', visualProps: ['shape']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'maintains specific aspect ratio for children',
  usage: {
    description:
      'Maintains a fixed width-to-height ratio for its children as its container resizes. Use it for media containers like videos, images, thumbnails, or any content that needs consistent proportions. It takes its width from the container and derives its height from the ratio, so it needs an ancestor with a definite width.',
    bestPractices: [
      {guidance: true, description: 'Express the ratio as a fraction for readability — `ratio={16 / 9}` rather than `ratio={1.78}`. It is a number, so the string form `ratio="16/9"` is a type error.'},
      {guidance: true, description: 'Use for media that needs consistent proportions across screen sizes.'},
      {guidance: true, description: 'Use `fit="cover"` for images and video so the component sizes the child; the child should not repeat `width`/`height`/`objectFit` styles.'},
      {guidance: true, description: 'Pass one child. With `fit` set, every direct child is stretched to fill the box, so put an overlay or caption inside a single wrapper child rather than passing it as a second child.'},
      {guidance: true, description: 'Describe media children with `alt`, or `alt=""` when the image is decorative. AspectRatio adds no role and no accessible name of its own, so the child carries the whole accessible description.'},
      {guidance: true, description: 'For a breakpoint-dependent ratio, override the ratio responsively: pass an `aspectRatio` rule via `xstyle` (StyleX), or override `aspect-ratio` from your own unlayered CSS under a `@media`/`@container` rule; component styles live in the `astryx-base` cascade layer, so unlayered consumer CSS wins. Give an `xstyle` rule a `default` branch alongside the conditional one (`{default: 3, \'@container ...\': \'3 / 2\'}`); with only the conditional branch the ratio is unset outside the query and the box collapses.'},
      {guidance: false, description: 'Use for general layout containers; use standard layout components instead.'},
      {guidance: false, description: 'Nest AspectRatio containers; one level is sufficient.'},
      {guidance: false, description: 'Constrain the height on its own. The width comes from the container, so a `height` or `maxHeight` by itself clamps the box off ratio; pair it with `width: "auto"` to size from the height instead.'},
      {guidance: false, description: 'Place it in a shrink-to-fit parent such as `inline-flex`, `width: fit-content` or a floated box. It contributes no intrinsic width there and collapses to zero.'},
    ],
    anatomy: [
      {name: 'Ratio box', required: true, description: 'The outer element that holds the aspect ratio and clips overflow. Carries the `astryx-aspect-ratio` theme target, and the elliptical clip when `shape` is `ellipse`.'},
      {name: 'Content slot', required: true, description: 'A wrapper that fills the ratio box and positions the child. With `fit` set it also sizes the child; without it the child styles itself.'},
    ],
  },
  propDescriptions: {
    ratio: 'width/height ratio (e.g. 16/9, 1); class-level declaration (never inline) so xstyle/unlayered-CSS @container overrides win',
    shape: "container shape: 'rectangle' (default) | 'ellipse' (circle at ratio 1)",
    fit: "child layout: 'cover' fill+crop | 'contain' fill+letterbox | 'center' natural size; omitted = child styles itself",
    children: 'content positioned absolutely to fill container',
    xstyle: 'StyleX layout customization via stylex.create()',
  },
};
