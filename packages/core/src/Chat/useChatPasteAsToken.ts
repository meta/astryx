// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatPasteAsToken.ts
 * @input Uses React refs, callbacks
 * @output Exports useChatPasteAsToken hook
 * @position Utility hook — composable paste behavior for ChatComposerInput
 *
 * Intercepts paste events and converts long text into a token chip
 * instead of inserting raw text into the contentEditable. Short
 * pastes pass through normally.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/useChatPasteAsToken.doc.mjs
 * - /packages/core/src/Chat/index.ts (exports)
 */

import {useCallback} from 'react';
import type {ClipboardEvent} from 'react';
import type {
  ChatComposerInputHandle,
  ChatComposerToken,
} from './ChatComposerInput';

// =============================================================================
// Types
// =============================================================================

export interface UseChatPasteAsTokenOptions {
  /** Ref to the composer input handle for inserting tokens. */
  inputRef: React.RefObject<ChatComposerInputHandle | null>;

  /**
   * Character count threshold — pastes longer than this become tokens.
   * @default 200
   */
  threshold?: number;

  /**
   * Convert pasted text into a token. Return the token to insert.
   * @default Creates a neutral badge with character count label.
   */
  toToken?: (text: string) => ChatComposerToken;
}

export interface UseChatPasteAsTokenReturn {
  /**
   * Pass as the onPaste prop on ChatComposerInput.
   * Returns true when the paste was converted to a token.
   */
  onPaste: (event: ClipboardEvent<HTMLDivElement>, text: string) => boolean;
}

// =============================================================================
// Default token factory
// =============================================================================

function defaultToToken(text: string): ChatComposerToken {
  const lines = text.split('\n').length;
  const chars = text.length;
  const label = lines > 1 ? `${lines} lines, ${chars} chars` : `${chars} chars`;
  return {
    value: text,
    label,
    variant: 'neutral' as const,
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useChatPasteAsToken({
  inputRef,
  threshold = 200,
  toToken = defaultToToken,
}: UseChatPasteAsTokenOptions): UseChatPasteAsTokenReturn {
  const onPaste = useCallback(
    (_event: ClipboardEvent<HTMLDivElement>, text: string): boolean => {
      if (text.length <= threshold) {
        return false;
      }

      const token = toToken(text);
      inputRef.current?.insertToken(token);
      return true;
    },
    [inputRef, threshold, toToken],
  );

  return {onPaste};
}
