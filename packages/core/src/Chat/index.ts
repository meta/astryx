// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Chat component barrel export
 *
 * SYNC: When modified, update /packages/core/src/index.ts
 */

export {ChatComposer} from './ChatComposer';
export type {
  ChatComposerProps,
  ChatComposerStatus,
  ChatComposerDensity,
} from './ChatComposer';

export {ChatSendButton} from './ChatSendButton';
export type {ChatSendButtonProps} from './ChatSendButton';

export {ChatComposerDrawer} from './ChatComposerDrawer';
export type {ChatComposerDrawerProps} from './ChatComposerDrawer';

export {ChatComposerInput, ChatComposerTokenElement} from './ChatComposerInput';
export type {
  ChatComposerInputProps,
  ChatComposerInputHandle,
  ChatComposerTokenElementProps,
  ChatComposerToken,
  ChatComposerTrigger,
  ChatComposerTriggerItem,
} from './ChatComposerInput';

export {ChatTokenizedText} from './ChatTokenizedText';
export type {ChatTokenizedTextProps} from './ChatTokenizedText';

export {ChatMessageList} from './ChatMessageList';
export type {ChatMessageListProps} from './ChatMessageList';

export {ChatMessage} from './ChatMessage';
export type {ChatMessageProps} from './ChatMessage';

export {ChatMessageBubble} from './ChatMessageBubble';
export type {
  ChatMessageBubbleProps,
  ChatMessageBubbleVariant,
} from './ChatMessageBubble';

export {ChatMessageMetadata} from './ChatMessageMetadata';
export type {
  ChatMessageMetadataProps,
  ChatMessageStatus,
} from './ChatMessageMetadata';

export {ChatSystemMessage} from './ChatSystemMessage';
export type {
  ChatSystemMessageProps,
  ChatSystemMessageVariant,
} from './ChatSystemMessage';

export {useChatStreamScroll} from './useChatStreamScroll';
export type {
  ChatScrollToBottomOptions,
  UseChatStreamScrollOptions,
  UseChatStreamScrollReturn,
} from './useChatStreamScroll';
export {useChatNewMessages} from './useChatNewMessages';
export type {
  UseChatNewMessagesOptions,
  UseChatNewMessagesReturn,
} from './useChatNewMessages';

export {useChatPasteAsToken} from './useChatPasteAsToken';
export type {
  UseChatPasteAsTokenOptions,
  UseChatPasteAsTokenReturn,
} from './useChatPasteAsToken';
export {useChatComposerTokens} from './useChatComposerTokens';
export type {
  UseChatComposerTokensOptions,
  UseChatComposerTokensReturn,
  TokenPortal,
} from './useChatComposerTokens';
export type {ChatMessageSender, ChatDensity} from './ChatContext';
export {useChatLayoutContext, useChatComposerContext} from './ChatContext';
export type {
  ChatComposerContextValue,
  ChatComposerInputControl,
} from './ChatContext';

export {ChatToolCalls} from './ChatToolCalls';
export type {
  ChatToolCallsProps,
  ChatToolCallItem,
  ChatToolCallStatus,
} from './ChatToolCalls';

export {ChatLayout} from './ChatLayout';
export {ChatLayoutScrollButton} from './ChatLayoutScrollButton';
export type {ChatLayoutScrollButtonProps} from './ChatLayoutScrollButton';
export type {ChatLayoutProps} from './ChatLayout';

export {useSpeechRecognition} from './useSpeechRecognition';
export type {
  UseSpeechRecognitionOptions,
  UseSpeechRecognitionReturn,
} from './useSpeechRecognition';

export {useChatDictation} from './useChatDictation';
export type {
  UseChatDictationOptions,
  UseChatDictationReturn,
} from './useChatDictation';

export {ChatDictationButton} from './ChatDictationButton';
export type {ChatDictationButtonProps} from './ChatDictationButton';
