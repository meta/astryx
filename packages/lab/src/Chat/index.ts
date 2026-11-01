// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Chat lab component barrel export
 * @input Imports experimental chat affordances
 * @output Exports lab chat components and related types
 * @position Lab Chat entry point; re-exported by packages/lab/src/index.ts
 */

export {ChatReactionBar} from './ChatReactionBar';
export type {ChatReactionBarProps, ChatReaction} from './ChatReactionBar';

export {ChatEmojiPicker, DEFAULT_CHAT_EMOJIS} from './ChatEmojiPicker';
export type {ChatEmojiPickerProps, ChatEmojiOption} from './ChatEmojiPicker';

export {ChatUnreadDivider} from './ChatUnreadDivider';
export type {ChatUnreadDividerProps} from './ChatUnreadDivider';

export {ChatTypingIndicator} from './ChatTypingIndicator';
export type {ChatTypingIndicatorProps} from './ChatTypingIndicator';

export {ChatVirtualizer} from './ChatVirtualizer';
export type {
  ChatVirtualizerProps,
  ChatVirtualizerHandle,
  ChatVirtualizerMeasureMode,
} from './ChatVirtualizer';
