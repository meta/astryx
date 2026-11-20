// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file cases.ts
 * @input A `?case=` value from the Chat Layout page's URL.
 * @output The page's cases: what each shows and what scrolls its transcript.
 * @position Read by the Chat Layout page and its test.
 */

export const CHAT_LAYOUT_CASES = [
  'long',
  'composer',
  'streaming',
  'docked',
] as const;

export type ChatLayoutCase = (typeof CHAT_LAYOUT_CASES)[number];

export interface ChatLayoutCaseInfo {
  /** What the case shows. The transcript opens with it. */
  label: string;
  /**
   * What scrolls the transcript. `document`: the page itself scrolls, and the
   * dock is fixed to the bottom of the viewport. `panel`: ChatLayout scrolls
   * itself inside a fixed-height panel, and the dock sticks to its bottom.
   */
  scroll: 'document' | 'panel';
}

export const CHAT_LAYOUT_CASE_INFO: Record<ChatLayoutCase, ChatLayoutCaseInfo> =
  {
    long: {label: 'A long conversation', scroll: 'document'},
    composer: {
      label: 'The composer and its actions, for the software keyboard',
      scroll: 'document',
    },
    streaming: {
      label: 'A reply streams in, and the conversation follows it',
      scroll: 'document',
    },
    docked: {
      label: 'The composer docked at the bottom of a fixed-height panel',
      scroll: 'panel',
    },
  };

/** The case a `?case=` value names. An unknown or missing value is `long`. */
export function parseChatLayoutCase(value: string | null): ChatLayoutCase {
  return CHAT_LAYOUT_CASES.find(chatCase => chatCase === value) ?? 'long';
}
