// Copyright (c) Meta Platforms, Inc. and affiliates.

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
    description: 'Active image or video presented inside the viewer.',
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
    description:
      'Caller-provided caption displayed below the active media. In a gallery it shows at most two lines; a longer caption ends in an inline "more" link that opens it in full over the photo.',
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
      description:
        'Callback when the lightbox open state changes: the Close button, Escape, a tap beside the media, or, on a phone or tablet, dragging a photo down from its fitted size.',
      required: true,
    },
    {
      name: 'media',
      // Left as the named type on purpose: the shape carries `caption?:
      // ReactNode`, so spelling it out makes the docsite playground parse the
      // whole prop as an editable *string*, which would feed the preview text
      // where a media object belongs. The shape and its legal values live in
      // the description instead (#1645).
      type: 'LightboxMedia | LightboxMedia[]',
      description:
        "Media to display. Pass a single object for one item, or an array for gallery mode with prev/next navigation (on a phone or tablet, a swipe moves between items too). Each item is {src: string, alt: string, caption?: ReactNode, type?: 'image' | 'video'}; type defaults to 'image', and zoom/pan is disabled for 'video'.",
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
        'Callback when the gallery index changes: prev/next, the arrow keys, or a swipe.',
    },
    {
      name: 'hasZoom',
      type: 'boolean',
      description:
        'Enable zoom (images only): pinch (or ctrl-wheel), or double-tap or double-click to zoom in at that point and back; Enter/Space/+/- zoom 2× about the centre and back, and 0 returns to the fitted size. When zoomed, drag or scroll a trackpad to pan, or use arrow keys; on a phone or a tablet, the pan has momentum.',
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
      'A fullscreen overlay for viewing images and videos at full resolution. Supports single-item and gallery modes with prev/next navigation and swiping, optional zoom and pan for images, and native video controls.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide alt text for every image for screen reader accessibility.',
      },
      {
        guidance: true,
        description:
          'Use gallery mode with onIndexChange for multi-image sets.',
      },
      {
        guidance: true,
        description:
          'Enable hasZoom only when viewing high-resolution images that benefit from close inspection.',
      },
      {
        guidance: false,
        description:
          'Use the lightbox for content other than images and videos; it shows one media item at a time.',
      },
      {
        guidance: false,
        description:
          'Nest interactive content inside captions; keep them plain text.',
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
      description:
        '灯箱打开状态变化时的回调：关闭按钮、Esc 键、点按媒体旁空白处，或在手机或平板上从适合大小向下拖动照片。',
      required: true,
    },
    {
      name: 'media',
      type: 'LightboxMedia | LightboxMedia[]',
      description:
        "要显示的媒体。传入单个对象或数组（用于画廊模式的上一张/下一张导航；在手机或平板上，滑动也可在各项之间切换）。每项为 {src, alt, caption?, type?: 'image' | 'video'}；type 默认为 'image'，'video' 禁用缩放/平移。",
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
      description:
        '启用缩放（仅图片）：双指捏合（或按住 Ctrl 滚动滚轮），或双点按、双击在该处放大并还原；Enter/Space/+/- 键以中心放大 2 倍并还原，0 键恢复到适合大小。缩放后可拖动或在触控板上滚动平移，或用方向键平移；在手机或平板上，平移带惯性。',
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
      'A fullscreen overlay for viewing images and videos at full resolution. Supports single-item and gallery modes with prev/next navigation and swiping, optional zoom and pan for images, and native video controls.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Always provide alt text for every image for screen reader accessibility.',
      },
      {
        guidance: true,
        description:
          'Use gallery mode with onIndexChange for multi-image sets.',
      },
      {
        guidance: true,
        description:
          'Enable hasZoom only when viewing high-resolution images that benefit from close inspection.',
      },
      {
        guidance: false,
        description:
          'Use the lightbox for content other than images and videos; it shows one media item at a time.',
      },
      {
        guidance: false,
        description:
          'Nest interactive content inside captions; keep them plain text.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Fullscreen overlay for viewing images and videos at full resolution with gallery navigation and zoom.',
  usage: {
    anatomy,
    description:
      'A fullscreen overlay for viewing images and videos at full resolution. Supports single-item and gallery modes with prev/next navigation and swiping, optional zoom and pan for images, and native video controls.',
    bestPractices: [
      {guidance: true, description: 'Always provide alt text for every image.'},
      {
        guidance: true,
        description:
          'Use gallery mode with onIndexChange for multi-image sets.',
      },
      {
        guidance: true,
        description:
          'Enable hasZoom only when viewing high-resolution images that benefit from close inspection.',
      },
      {
        guidance: false,
        description:
          'Use for content other than images and videos; one media item at a time.',
      },
      {
        guidance: false,
        description:
          'Nest interactive content inside captions; keep them plain text.',
      },
    ],
  },
  propDescriptions: {
    isOpen: 'Whether the lightbox is open.',
    onOpenChange:
      'Callback when open state changes (including a photo dragged down).',
    media: 'Single media object or array for gallery mode.',
    index: 'Current index in gallery mode.',
    onIndexChange:
      'Callback when gallery index changes (buttons, keys or a swipe).',
    hasZoom:
      'Enable zoom (pinch or ctrl-wheel, double-tap or double-click, Enter/Space, or +/-; 0 resets) and pan (drag, trackpad scroll, or arrow keys) for images.',
    xstyle: 'StyleX styles for layout customization.',
  },
};
