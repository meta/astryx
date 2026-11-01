// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Lightbox.doc.mjs
 * @input Lightbox public props and custom content keyboard behavior
 * @output Consumer documentation for media and custom galleries
 * @position Lightbox docs consumed by the CLI and docsite
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Viewer overlay',
    required: true,
    description:
      'Full-viewport dialog overlay that contains the active media and controls.',
  },
  {
    name: 'Media',
    required: true,
    description:
      'Active image, video, or custom React content presented inside the viewer.',
  },
  {
    name: 'Close button',
    required: true,
    description: 'Button that closes the viewer.',
  },
  {
    name: 'Previous button',
    required: false,
    description: 'Gallery button that moves to the previous media item.',
  },
  {
    name: 'Next button',
    required: false,
    description: 'Gallery button that moves to the next media item.',
  },
  {
    name: 'Caption',
    required: false,
    description: 'Caller-provided caption displayed below the active media.',
  },
  {
    name: 'Counter',
    required: false,
    description: 'Current position and total shown in gallery mode.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Lightbox',
  displayName: 'Lightbox',
  category: 'Overlay',
  keywords: [
    'lightbox',
    'image',
    'video',
    'viewer',
    'gallery',
    'zoom',
    'fullscreen',
    'media',
    'photo',
    'preview',
    'custom',
    'content',
    'react',
  ],
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Whether the lightbox is open.',
      required: true,
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Callback when the lightbox open state changes.',
      required: true,
    },
    {
      name: 'media',
      // Left as the named type on purpose: the shape carries `caption?:
      // ReactNode`, so spelling it out makes the docsite playground parse the
      // whole prop as an editable *string*, which would feed the preview text
      // where a media object belongs. The shape and its legal values live in
      // the description instead (#1645).
      type: 'LightboxItem | LightboxItem[]',
      description:
        "Items to display. Pass a single object for one item, or an array for gallery mode with prev/next navigation. Each item is either a media item {src: string, alt: string, caption?: ReactNode, type?: 'image' | 'video'} (type defaults to 'image', and zoom/pan is disabled for 'video') or a custom item {type: 'custom', content: ReactNode, label: string, caption?: ReactNode}, which renders arbitrary React content without zoom/pan. Both kinds can be mixed in one gallery.",
      required: true,
    },
    {
      name: 'index',
      type: 'number',
      description: 'Current index in gallery mode (when media is an array).',
    },
    {
      name: 'onIndexChange',
      type: '(index: number) => void',
      description:
        'Callback when the gallery index changes via prev/next navigation.',
    },
    {
      name: 'hasZoom',
      type: 'boolean',
      description:
        'Enable zoom on double-click, or Enter/Space/+/- via keyboard (images only). When zoomed, drag or use arrow keys to pan.',
      default: 'false',
    },
    {
      name: 'defaultIndex',
      type: 'number',
      description:
        'Initial image index in gallery mode for uncontrolled usage.',
      default: '0',
    },
    {
      name: 'hasAutoPlay',
      type: 'boolean',
      description:
        'Automatically start video playback when a video media item is shown.',
      default: 'false',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization. Must be stylex.create() value.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-lightbox', visualProps: []}],
  },
  usage: {
    anatomy,
    description:
      'A fullscreen overlay for viewing images, videos, and arbitrary React content at full resolution. Supports single-item and gallery modes with prev/next navigation, optional zoom and pan for images, and native video controls. Items with type custom host a rich React subtree and reuse the same gallery navigation, keyboard, scroll lock, and backdrop dismissal.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use the viewer or gallery buttons for Left/Right shortcuts. Custom content retains its own keyboard events; Lightbox does not cancel them or change the gallery index.',
      },
      {
        guidance: true,
        description:
          'Always provide alt text for every image, and a label for every custom item, for screen reader accessibility.',
      },
      {
        guidance: true,
        description: 'Use gallery mode with onIndexChange for multi-item sets.',
      },
      {
        guidance: true,
        description:
          'Enable hasZoom only when viewing high-resolution images that benefit from close inspection; zoom and pan apply to images only.',
      },
      {
        guidance: true,
        description:
          'Use type custom items to host rich React previews, embeds, or cards inside the same gallery as images.',
      },
      {
        guidance: false,
        description:
          'Nest interactive controls inside a caption; put interactive footers inside a custom item content instead.',
      },
    ],
  },
  // The lightbox opens via showModal() and renders nothing while closed —
  // overlay mode gives the Properties preview an open trigger instead of an
  // empty stage, mirroring MobileNav (#3616).
  playground: {
    overlay: true,
    defaults: {
      isOpen: false,
      media: {
        src: '/template-assets/light-scene-horizontal-1.png',
        alt: 'Coastal shoreline with ocean waves',
        caption:
          'A scenic coastline with waves rolling onto a sandy beach beneath a clear sky.',
      },
    },
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Lightbox',
  displayName: 'Lightbox',
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description: '灯箱是否打开。',
      required: true,
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: '灯箱打开状态变化时的回调。',
      required: true,
    },
    {
      name: 'media',
      type: 'LightboxItem | LightboxItem[]',
      description:
        "要显示的项目。传入单个对象或数组（用于画廊模式的上一张/下一张导航）。每项可以是媒体项 {src, alt, caption?, type?: 'image' | 'video'}（type 默认为 'image'，'video' 禁用缩放/平移），也可以是自定义项 {type: 'custom', content, label, caption?}（渲染任意 React 内容，不支持缩放/平移）。两种类型可在同一画廊中混用。",
      required: true,
    },
    {
      name: 'index',
      type: 'number',
      description: '画廊模式中当前索引。',
    },
    {
      name: 'onIndexChange',
      type: '(index: number) => void',
      description: '通过上一张/下一张导航更改画廊索引时的回调。',
    },
    {
      name: 'hasZoom',
      type: 'boolean',
      description: '启用双击缩放（仅图片）。缩放后可拖动平移。',
      default: 'false',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式。必须是 stylex.create() 的值。',
    },
  ],
  theming: {
    targets: [{className: 'astryx-lightbox', visualProps: []}],
  },
  usage: {
    anatomy,
    description:
      'A fullscreen overlay for viewing images, videos, and arbitrary React content at full resolution. Supports single-item and gallery modes with prev/next navigation, optional zoom and pan for images, and native video controls. Items with type custom host a rich React subtree and reuse the same gallery navigation, keyboard, scroll lock, and backdrop dismissal.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use the viewer or gallery buttons for Left/Right shortcuts. Custom content retains its own keyboard events; Lightbox does not cancel them or change the gallery index.',
      },
      {
        guidance: true,
        description:
          'Always provide alt text for every image, and a label for every custom item, for screen reader accessibility.',
      },
      {
        guidance: true,
        description: 'Use gallery mode with onIndexChange for multi-item sets.',
      },
      {
        guidance: true,
        description:
          'Enable hasZoom only when viewing high-resolution images that benefit from close inspection; zoom and pan apply to images only.',
      },
      {
        guidance: true,
        description:
          'Use type custom items to host rich React previews, embeds, or cards inside the same gallery as images.',
      },
      {
        guidance: false,
        description:
          'Nest interactive controls inside a caption; put interactive footers inside a custom item content instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Fullscreen overlay for viewing images, videos, and arbitrary React content at full resolution with gallery navigation and zoom.',
  usage: {
    anatomy,
    description:
      'A fullscreen overlay for viewing images, videos, and arbitrary React content at full resolution. Supports single-item and gallery modes with prev/next navigation, optional zoom and pan for images, and native video controls. Items with type custom host a rich React subtree and reuse the gallery navigation, keyboard, scroll lock, and backdrop dismissal.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use the viewer or gallery buttons for Left/Right shortcuts. Custom content retains its own keyboard events; Lightbox does not cancel them or change the gallery index.',
      },
      {
        guidance: true,
        description:
          'Always provide alt text for every image and a label for every custom item.',
      },
      {
        guidance: true,
        description: 'Use gallery mode with onIndexChange for multi-item sets.',
      },
      {
        guidance: true,
        description:
          'Enable hasZoom only for high-resolution images; zoom and pan apply to images only.',
      },
      {
        guidance: true,
        description:
          'Use type custom items to host rich React previews inside the same gallery as images.',
      },
      {
        guidance: false,
        description:
          'Nest interactive controls inside a caption; use a custom item content instead.',
      },
    ],
  },
  propDescriptions: {
    isOpen: 'Whether the lightbox is open.',
    onOpenChange: 'Callback when open state changes.',
    media:
      'Single item or array for gallery mode; each item is an image/video or a custom React subtree (type custom).',
    index: 'Current index in gallery mode.',
    onIndexChange: 'Callback when gallery index changes.',
    hasZoom:
      'Enable zoom (double-click, Enter/Space, or +/-) and pan (drag or arrow keys) for images.',
    xstyle: 'StyleX styles for layout customization.',
  },
};
