// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatMessageMetadata',
  subComponentOf: 'Chat',
  displayName: 'Chat Message Metadata',
  description:
    'Composable metadata row for chat messages. Renders timestamp, footer content, and delivery status in a single row. Direction reverses for user sender. Omits the row when both slots are omitted or non-rendering scalars and status is omitted.',
  props: [
    {
      name: 'timestamp',
      type: 'ReactNode',
      description: 'Timestamp content: a string or Timestamp component.',
      slotElements: [
        {
          __element: 'Text',
          props: {
            type: 'body',
          },
          children: 'Just now',
        },
      ],
    },
    {
      name: 'footer',
      type: 'ReactNode',
      description: 'Footer content: model info, reaction buttons, copy button.',
      slotElements: [
        {
          __element: 'Text',
          props: {
            type: 'body',
          },
          children: 'Footer content',
        },
      ],
    },
    {
      name: 'status',
      type: "'sending' | 'sent' | 'delivered' | 'read' | 'error'",
      description: 'Message delivery status. Shows icon + label.',
    },
  ],
  usage: {
    description:
      'Place ChatMessageMetadata below a message or in the last ChatMessageBubble metadata slot to show a timestamp, footer content, and optional delivery status. Non-rendering scalar slots (booleans and empty strings) create no separator; numeric zero remains visible. Composite React content remains caller-owned.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Put metadata in the last bubble metadata slot when the message uses bubbles, so it follows the bubble content.',
      },
      {
        guidance: true,
        description:
          'Pass timestamp and footer content independently; separators are omitted for non-rendering scalar slots. Composite React nodes are used as supplied.',
      },
      {
        guidance: false,
        description:
          'Do not supply footer actions without their own accessible names and interaction behavior; the metadata row does not own those controls.',
      },
      {
        guidance: false,
        description:
          'Do not put the same metadata on both a bubble and its enclosing message.',
      },
    ],
    anatomy: [
      {
        name: 'Metadata row',
        required: true,
        description: 'Sender-aware line containing the visible metadata items.',
      },
      {
        name: 'Timestamp',
        required: false,
        description:
          'Caller-supplied time content at the start of the logical sequence.',
      },
      {
        name: 'Footer',
        required: false,
        description:
          'Caller-supplied information or actions between time and status.',
      },
      {
        name: 'Status',
        required: false,
        description:
          'Localized delivery icon and text when a status is supplied.',
      },
    ],
  },
};

export const docsZh = {
  name: 'ChatMessageMetadata',
  displayName: 'Chat Message Metadata',
  description:
    '可组合的消息元数据行。渲染时间戳、页脚内容和发送状态。用户消息方向反转。',
  propDescriptions: {
    timestamp: '时间戳内容，字符串或 Timestamp 组件。',
    footer: '页脚内容：模型信息、反应按钮、复制按钮。',
    status: '消息发送状态。显示图标和标签。',
  },
};

export const docsDense = {
  name: 'ChatMessageMetadata',
  displayName: 'Chat Message Metadata',
  description:
    'composable metadata row; renders timestamp · footer · status; reverses for user sender',
  propDescriptions: {
    timestamp: 'timestamp content; string or Timestamp',
    footer: 'footer content; model info, reaction btns, copy btn',
    status: 'delivery status; shows icon+label',
  },
};
