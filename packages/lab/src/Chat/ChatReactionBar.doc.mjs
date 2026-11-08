// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatReactionBar',
  subComponentOf: 'Chat',
  group: 'Chat',
  category: 'Chat',
  displayName: 'Chat Reaction Bar',
  description: 'Row of emoji reaction pills under a chat message. Each pill shows an emoji and count; the current user\'s own reactions get an accent tint and aria-pressed. Provide onAdd to render a trailing add-reaction button that opens a ChatEmojiPicker popover.',
  props: [
    {
      name: 'reactions',
      type: '{emoji: string; count: number; isSelected?: boolean; label?: string}[]',
      description: 'Reactions to render, in display order. isSelected marks the current user\'s own reactions (accent tint + aria-pressed). label is a human-readable description like "Ana and Dana reacted with 🎉", used as the pill tooltip and accessible label.',
      required: true,
    },
    {
      name: 'onToggle',
      type: '(emoji: string) => void',
      description: 'Called with the pill\'s emoji when the user toggles a reaction on or off.',
    },
    {
      name: 'onAdd',
      type: '(emoji: string) => void',
      description: 'Called with the picked emoji when the user adds a reaction from the emoji picker. The trailing add-reaction button renders only when provided.',
    },
    {
      name: 'emojis',
      type: 'readonly ChatEmojiOption[]',
      description: 'Emoji options for the add-reaction picker. Defaults to DEFAULT_CHAT_EMOJIS.',
    },
    {
      name: 'addLabel',
      type: 'string',
      description: 'Accessible label for the add-reaction button and picker dialog.',
      default: "'Add reaction'",
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the reaction group.',
      default: "'Reactions'",
    },
  ],
};

export const docsZh = {
  name: 'ChatReactionBar',
  displayName: 'Chat Reaction Bar',
  description: '聊天消息下方的表情回应胶囊行。每个胶囊显示表情和数量；当前用户自己的回应带有强调色和 aria-pressed。提供 onAdd 会渲染末尾的添加回应按钮，打开 ChatEmojiPicker 弹出层。',
  propDescriptions: {
    reactions: '按显示顺序渲染的回应列表。isSelected 标记当前用户自己的回应（强调色 + aria-pressed）。label 是人类可读的描述，用作胶囊的提示与无障碍标签。',
    onToggle: '用户切换回应时以该表情调用。',
    onAdd: '用户从表情选择器添加回应时以所选表情调用。仅在提供时渲染末尾的添加按钮。',
    emojis: '添加回应选择器的表情选项，默认 DEFAULT_CHAT_EMOJIS。',
    addLabel: '添加回应按钮与选择器对话框的无障碍标签。',
    label: '回应组的无障碍标签。',
  },
};

export const docsDense = {
  name: 'ChatReactionBar',
  displayName: 'Chat Reaction Bar',
  description: 'emoji reaction pills under a message; own reactions accent-tinted w/ aria-pressed; onAdd renders trailing add button opening ChatEmojiPicker popover',
  propDescriptions: {
    reactions: '{emoji,count,isSelected?,label?}[]; label doubles as tooltip + aria label',
    onToggle: '(emoji)=>void on pill click',
    onAdd: '(emoji)=>void from picker; enables add button',
    emojis: 'picker option override; default DEFAULT_CHAT_EMOJIS',
    addLabel: 'add button + picker dialog label',
    label: 'group aria label',
  },
};
