// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatContext.tsx
 * @input Layer-scoped React context
 * @output Exports Chat message/list/composer/layout contexts. The composer
 *   context (value + input-control registration) is public composition API,
 *   re-exported from Chat/index.ts for custom inputs.
 * @position Shared contexts; consumed by ChatMessage, ChatComposer,
 *   ChatComposerInput, ChatSendButton, and custom inputs.
 */

import {createContext, use, type RefObject} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

export type ChatMessageSender = 'user' | 'assistant' | 'system';
export type ChatDensity = 'compact' | 'balanced' | 'spacious';

export interface ChatMessageContextValue {
  sender: ChatMessageSender;
  density: ChatDensity;
}

export const ChatMessageContext =
  createLayerScopedContext<ChatMessageContextValue | null>(null);
ChatMessageContext.displayName = 'ChatMessageContext';

export function useChatMessageContext(): ChatMessageContextValue | null {
  return use(ChatMessageContext);
}

export interface ChatListContextValue {
  density: ChatDensity;
}

export const ChatListContext =
  createLayerScopedContext<ChatListContextValue | null>(null);
ChatListContext.displayName = 'ChatListContext';

export function useChatListContext(): ChatListContextValue | null {
  return use(ChatListContext);
}

// =============================================================================
// Composer context — shared state between ChatComposer and ChatComposerInput
// =============================================================================

/**
 * Imperative surface the composer shell can invoke on its input slot.
 *
 * The input is one slot inside the composer body — it does not span the whole
 * body — so shell-level interactions like "click empty space to focus the
 * input" must flow shell → input. A custom input registers this control (via
 * `ChatComposerContextValue.inputControlRef`) so the shell can drive it
 * without knowing its DOM shape. Optional methods can be added over time;
 * inputs implement only what they support.
 */
export interface ChatComposerInputControl {
  /** Move keyboard focus into the input. */
  focus: () => void;
}

export interface ChatComposerContextValue {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  isDisabled: boolean;
  isStopShown: boolean;
  canSend: boolean;
  onStop?: () => void;
  /**
   * Mutable handle the input slot populates with its {@link
   * ChatComposerInputControl}. The shell reads `.current` to drive the input
   * (e.g. focus on body click). A custom input assigns
   * `inputControlRef.current = { focus }` on mount and clears it on unmount.
   * When unset, the shell falls back to focusing a `contenteditable`/`textarea`
   * it finds in the body.
   */
  inputControlRef?: RefObject<ChatComposerInputControl | null>;
}

export const ChatComposerContext =
  createContext<ChatComposerContextValue | null>(null);
ChatComposerContext.displayName = 'ChatComposerContext';

export function useChatComposerContext(): ChatComposerContextValue | null {
  return use(ChatComposerContext);
}

// =============================================================================
// Layout context — shared between ChatLayout and ChatMessageList
// =============================================================================

export interface ChatLayoutContextValue {
  /** Ref to the scrollable container element that wraps the message area. */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Callback ref for the message list content element — layout observes it for size changes. */
  contentRef: (el: HTMLElement | null) => void;
}

export const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(
  null,
);
ChatLayoutContext.displayName = 'ChatLayoutContext';

export function useChatLayoutContext(): ChatLayoutContextValue | null {
  return use(ChatLayoutContext);
}
