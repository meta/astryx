// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatMessageBubble',
  subComponentOf: 'Chat',
  displayName: 'Chat Message Bubble',
  isHiddenFromOverview: true,
  description:
    'Styled content container for the chat "bubble." Reads sender from parent ChatMessage context to auto-style the background. Use filled for standard messages and ghost when content needs alignment without a visible boundary. Supports name/metadata slots aligned with bubble padding, and multi-bubble grouping via the group prop for consecutive messages from the same sender.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Bubble content: text, Markdown, or any ReactNode.',
      required: true,
    },
    {
      name: 'variant',
      type: "'filled' | 'ghost'",
      description:
        "Visual variant. 'filled' renders sender-colored background (default). 'ghost' renders transparent background but keeps padding for alignment.",
      default: "'filled'",
    },
    {
      name: 'name',
      type: 'ReactNode',
      description:
        "Sender name rendered above the bubble, aligned with bubble text padding. Use on the first bubble in a message. Non-rendering scalar values (null, undefined, booleans, and the empty string) omit the aligned wrapper; numeric 0 remains aligned. If the first content is raw (no bubble), use ChatMessage's `name` prop instead.",
    },
    {
      name: 'metadata',
      type: 'ReactNode',
      description:
        "Metadata content rendered below the bubble, aligned with bubble text padding. Use on the last bubble in a message. Non-rendering scalar values (null, undefined, booleans, and the empty string) omit the aligned wrapper; numeric 0 remains aligned. If the last content is raw (no bubble), use ChatMessage's `metadata` prop instead.",
      slotElements: [
        {
          __element: 'Text',
          props: {
            type: 'body',
          },
          children: 'Metadata',
        },
      ],
    },
    {
      name: 'group',
      type: "'first' | 'middle' | 'last'",
      description:
        'Position within a multi-bubble group. Controls corner radius reduction on the sender side. Leave unset for standalone bubbles (full radius).',
    },
    {
      name: 'width',
      type: 'SizeValue',
      description:
        'Width of the bubble (number = pixels, string = used as-is). When set, replaces the default max(80%, 280px) width cap. Combine with variant="ghost" to let custom content (an artifact card, attachments) span the full message column.',
    },
  ],
};

export const docsZh = {
  name: 'ChatMessageBubble',
  isHiddenFromOverview: true,
  displayName: 'Chat Message Bubble',
  description:
    '样式化的气泡容器，从父上下文读取发送者信息进行自动样式化。支持 name/metadata 插槽、多气泡分组和透明变体。',
  propDescriptions: {
    children: '气泡内容：文本、Markdown 或任何 ReactNode。',
    variant:
      "视觉变体。'filled' 渲染发送者颜色背景，'ghost' 渲染透明背景但保持填充对齐。",
    name: '气泡上方渲染的发送者名称，与气泡文本内边距对齐。null、undefined、布尔值和空字符串会省略对齐容器；数字 0 仍保持对齐。用于消息中的第一个气泡。',
    metadata:
      '气泡下方渲染的元数据内容，与气泡文本内边距对齐。null、undefined、布尔值和空字符串会省略对齐容器；数字 0 仍保持对齐。用于消息中的最后一个气泡。',
    group: '多气泡组中的位置。控制发送者侧的圆角缩减。',
    width:
      '气泡宽度（数字 = 像素，字符串 = 按原样使用）。设置后替代默认的 max(80%, 280px) 宽度上限；与 ghost 变体组合可让自定义内容占满消息列宽度。',
  },
};

export const docsDense = {
  name: 'ChatMessageBubble',
  isHiddenFromOverview: true,
  displayName: 'Chat Message Bubble',
  description:
    'styled bubble container; reads sender from context; supports name/metadata slots, group corners, ghost variant',
  propDescriptions: {
    children: 'bubble content: text, Markdown, any ReactNode',
    variant: 'filled (sender bg) or ghost (transparent, keeps padding)',
    name: 'sender name above bubble; omits non-rendering scalars; keeps numeric 0 aligned',
    displayName: 'sender name above bubble, aligned w/ bubble padding',
    metadata:
      'metadata below bubble; omits non-rendering scalars; keeps numeric 0 aligned',
    group: 'position in multi-bubble group; controls corner radius reduction',
    width:
      'bubble width (number=px, string=as-is); replaces default max(80%,280px) cap; ghost+width="100%" spans full message column',
  },
};
