// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatMessageListVirtualization.ts
 * @input None
 * @output An opaque capability for ChatMessageList.virtualization, stable
 *   for the life of the component that calls the hook
 * @position Opt-in windowing for long conversations. ChatMessageList owns the
 *   items, ChatLayout owns the scroll container, and this import alone
 *   reaches the windowing code.
 */
import {useMemo} from 'react';
import {CHAT_MESSAGE_LIST_WINDOWING} from './ChatMessageListWindow';
import {
  VIRTUALIZATION_CAPABILITY,
  type ChatMessageListVirtualizationCapability,
} from './chatMessageListVirtualization';

/**
 * Opt a ChatMessageList item model into windowing: inside ChatLayout, only
 * the rows near the scrollport mount, so a conversation of thousands of
 * messages costs about one screen of DOM. The list opens at its newest
 * message and keeps the reader's place as rows measure and older items load.
 *
 * @example
 * ```
 * const virtualization = useChatMessageListVirtualization();
 * <ChatLayout composer={<ChatComposer onSubmit={send} />}>
 *   <ChatMessageList
 *     items={messages}
 *     getItemKey={message => message.id}
 *     renderItem={renderMessage}
 *     virtualization={virtualization}
 *   />
 * </ChatLayout>;
 * ```
 */
export function useChatMessageListVirtualization(): ChatMessageListVirtualizationCapability {
  return useMemo(
    () =>
      Object.freeze({
        [VIRTUALIZATION_CAPABILITY]: CHAT_MESSAGE_LIST_WINDOWING,
      }) as unknown as ChatMessageListVirtualizationCapability,
    [],
  );
}
