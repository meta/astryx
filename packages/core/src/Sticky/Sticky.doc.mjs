// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Sticky',
  displayName: 'Sticky',
  category: 'Layout',
  keywords: ['sticky', 'scroll', 'position', 'fixed'],
  props: [
    {
      name: 'axis',
      type: "'both' | 'horizontal' | 'vertical'",
      description: 'The axes on which the element sticks.',
      default: "'vertical'",
    },
    {
      name: 'offsetTop',
      type: 'number',
      description:
        'Distance from the top edge when vertical positioning is enabled.',
      default: '0',
    },
    {
      name: 'offsetInlineEnd',
      type: 'number',
      description:
        'Distance from the inline end when horizontal positioning is enabled.',
    },
    {
      name: 'offsetBottom',
      type: 'number',
      description:
        'Distance from the bottom edge when vertical positioning is enabled.',
    },
    {
      name: 'offsetInlineStart',
      type: 'number',
      description:
        'Distance from the inline start when horizontal positioning is enabled.',
    },
    {
      name: 'isEnabled',
      type: 'boolean',
      description: 'Whether sticky positioning is active.',
      default: 'true',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for the root element.',
    },
  ],
  usage: {
    description:
      'Keeps an element at the selected edge of its nearest scroll container while that container scrolls. The element returns to normal flow when it reaches the end of its containing block.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use a scroll container with enough content for the sticky behavior to be visible.',
      },
      {
        guidance: true,
        description:
          'Set an offset when a fixed header or other edge control would cover the sticky element.',
      },
      {
        guidance: false,
        description:
          'Add overflow clipping to an ancestor only when that ancestor should be the sticky element’s scroll container.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Sticky',
  displayName: 'Sticky',
  props: [
    {
      name: 'axis',
      type: "'both' | 'horizontal' | 'vertical'",
      description: '元素固定的轴。',
      default: "'vertical'",
    },
    {
      name: 'offsetTop',
      type: 'number',
      description: '启用垂直定位时与顶部边缘的距离。',
      default: '0',
    },
    {
      name: 'offsetInlineEnd',
      type: 'number',
      description: '启用水平定位时与行内结束边缘的距离。',
    },
    {
      name: 'offsetBottom',
      type: 'number',
      description: '启用垂直定位时与底部边缘的距离。',
    },
    {
      name: 'offsetInlineStart',
      type: 'number',
      description: '启用水平定位时与行内起始边缘的距离。',
    },
    {
      name: 'isEnabled',
      type: 'boolean',
      description: '是否启用粘性定位。',
      default: 'true',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '根元素的 StyleX 样式。',
    },
  ],
  usage: {
    description:
      '滚动最近的滚动容器时，将元素保持在所选边缘。元素到达其包含块末端时会恢复正常流布局。',
    bestPractices: [
      {
        guidance: true,
        description: '使用内容足够多的滚动容器，以便观察粘性定位效果。',
      },
      {
        guidance: true,
        description: '如果固定页眉或其他边缘控件可能遮挡元素，请设置偏移量。',
      },
      {
        guidance: false,
        description:
          '如果元素需要固定到其他滚动容器，请勿将其放在会裁剪溢出内容的祖先元素中。',
      },
    ],
  },
};
