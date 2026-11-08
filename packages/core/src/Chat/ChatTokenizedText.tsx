// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatTokenizedText.tsx
 * @input Uses React, Badge, ChatComposerToken
 * @output Exports ChatTokenizedText component
 * @position Utility component for rendering tokenized text in message bubbles
 *
 * Parses a plain text string and replaces non-empty token values with inline
 * token content. Accepts the same ChatComposerToken type used by the input
 * triggers, so the same token definitions work for both input and display.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/index.ts
 * - /packages/core/src/Chat/ChatComposerInput.tsx (token alignment must match,
 *   or a token moves when the message is sent)
 * - /packages/cli/assets/templates/blocks/components/ChatTokenizedText/ (block examples)
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Badge} from '../Badge';
import type {ChatComposerToken} from './ChatComposerInput';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'inline',
  },
  token: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '1lh',
    verticalAlign: 'top',
  },
});

// =============================================================================
// Types
// =============================================================================

export interface ChatTokenizedTextProps extends BaseProps<HTMLSpanElement> {
  ref?: React.Ref<HTMLSpanElement>;
  /** The message text containing serialized token values */
  children: string;
  /**
   * Token definitions — same type returned by trigger onSelect.
   * Each non-empty token `value` is matched literally against the text and
   * replaced with its Badge or custom representation. Empty values are ignored.
   *
   * @example
   * ```
   * const mentionTokens = contacts.map(c => ({
   *   value: `@${c.id}`,
   *   label: `@${c.label}`,
   *   variant: 'blue' as const,
   * }));
   * <ChatTokenizedText tokens={mentionTokens}>
   *   {message.text}
   * </ChatTokenizedText>
   * ```
   */
  tokens?: ChatComposerToken[];
}

// =============================================================================
// Helpers
// =============================================================================

function isCustomToken(
  token: ChatComposerToken,
): token is {value: string; render: () => ReactNode} {
  return 'render' in token && typeof token.render === 'function';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// Component
// =============================================================================

/**
 * Renders text with token values replaced by inline token content.
 *
 * Accepts the same `ChatComposerToken` type used by input triggers,
 * so you can share a single token definition between input and display.
 */
export function ChatTokenizedText({
  ref,
  children,
  tokens,
  xstyle,
  className,
  style,
  ...rest
}: ChatTokenizedTextProps) {
  if (!children || !tokens || tokens.length === 0) {
    return (
      <span
        ref={ref}
        {...mergeProps(
          themeProps('chat-tokenized-text'),
          stylex.props(styles.root, xstyle),
          className,
          style,
        )}
        {...rest}>
        {children ?? ''}
      </span>
    );
  }

  const parts = renderTokens(children, tokens);
  return (
    <span
      ref={ref}
      {...mergeProps(
        themeProps('chat-tokenized-text'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...rest}>
      {parts}
    </span>
  );
}

ChatTokenizedText.displayName = 'ChatTokenizedText';

// =============================================================================
// Render
// =============================================================================

function renderTokens(text: string, tokens: ChatComposerToken[]): ReactNode[] {
  const matchableTokens = tokens.filter(token => token.value.length > 0);

  if (matchableTokens.length === 0) {
    return [text];
  }

  const pattern = matchableTokens.map(t => escapeRegExp(t.value)).join('|');
  const regex = new RegExp(`(${pattern})`, 'g');

  const tokenMap = new Map<string, ChatComposerToken>();
  for (const t of matchableTokens) {
    tokenMap.set(t.value, t);
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    const token = tokenMap.get(matched);
    if (token) {
      parts.push(
        <span key={`${matched}-${match.index}`} {...stylex.props(styles.token)}>
          {isCustomToken(token) ? (
            token.render()
          ) : (
            <Badge
              label={token.label}
              variant={token.variant}
              icon={token.icon}
            />
          )}
        </span>,
      );
    }

    lastIndex = match.index + matched.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
