// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatTypingIndicator.a11y.states.ts
 * @input Uses StatusMessageStateFacts from the shared accessibility contract
 * @output The AST-021 inventory for ChatTypingIndicator status states and exclusions
 * @position Data-only binding inventory shared by jsdom, Storybook, and Chromium
 */

import type {StatusMessageStateFacts} from '@astryxdesign/a11y-spec';

export type ChatTypingStatusStateId = 'chat-typing-empty-to-message';

export interface ChatTypingStatusBindingDefinition {
  readonly id: ChatTypingStatusStateId;
  readonly binding: 'ChatTypingIndicator announcement channel';
  readonly summary: string;
  readonly facts: StatusMessageStateFacts;
  readonly storyId: string;
}

const LIFECYCLE_FACTS: StatusMessageStateFacts = {
  kind: 'live-region',
  role: 'status',
  politeness: 'polite',
  messageSource: 'text',
  initialMessage: '',
  message: 'Ana is typing…',
  replacement: 'Ana and Ben are typing…',
  semanticTransitions: ['show', 'replace'],
};

export const CHAT_TYPING_STATUS_BINDING_STATES: ReadonlyArray<ChatTypingStatusBindingDefinition> =
  [
    {
      id: 'chat-typing-empty-to-message',
      binding: 'ChatTypingIndicator announcement channel',
      summary:
        'one name, then two, reach the persistent polite channel as the indicator updates',
      facts: LIFECYCLE_FACTS,
      storyId: 'a11y-status-message-pattern--chat-typing-empty-to-message',
    },
  ];

export type ChatTypingStatusBindingState = ChatTypingStatusBindingDefinition;

export const CHAT_TYPING_STATUS_EXCLUSIONS = [
  {
    owner: 'ChatTypingIndicator',
    part: 'omitted names',
    reason:
      'Omitted names and an empty names array render the same dots-only indicator and announce nothing, so one binding row covers both inputs.',
  },
  {
    owner: 'ChatTypingIndicator',
    part: 'indicator mounted with names',
    reason:
      'A named indicator that mounts announces its label once through the same channel; the channel text clears on its own timer, so the mount occasion is asserted with a channel spy in ChatTypingIndicator.test.tsx rather than as a bound initial state.',
  },
  {
    owner: 'useAnnounce',
    part: 'clearing the names',
    reason:
      'Clearing removes the visible label and announces nothing; the channel clears its own text after each announcement, so no clear transition is observable on it.',
  },
  {
    owner: 'ChatTypingIndicator and theme',
    part: 'typing-dot animation and reduced motion',
    reason:
      'The dots are decorative and aria-hidden; their paint and reduced-motion behavior stay in component and visual evidence.',
  },
  {
    owner: 'ChatMessageList',
    part: 'transcript log announcements',
    reason:
      'Inside a role=log the indicator announces nothing and the log delivers the label as added content (spec:AST-086 FR4), asserted in ChatTypingIndicator.test.tsx.',
  },
] as const;
