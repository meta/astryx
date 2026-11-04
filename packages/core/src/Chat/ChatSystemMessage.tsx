// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatSystemMessage.tsx
 * @input Uses React, StyleX, theme tokens
 * @output Exports ChatSystemMessage component and ChatSystemMessageProps
 * @position Centered, wrapping system/notice message in a chat thread
 *
 * Renders centered, muted system messages like "conversation started",
 * date separators, or status updates. Not a sender message — no avatar,
 * no bubble, no alignment. Think of it as the chat equivalent of a banner
 * or status line.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Chat/index.ts (exports)
 * - /apps/storybook/stories/Chat.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ChatSystemMessage/ (block examples)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  fontWeightVars,
  typographyVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {isRenderable} from '../utils/isRenderable';
import {Divider} from '../Divider';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

export type ChatSystemMessageVariant = 'default' | 'divider';

export interface ChatSystemMessageProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * System message content — text or any ReactNode.
   */
  children: ReactNode;

  /**
   * Visual variant.
   * - 'default': plain centered text
   * - 'divider': text with horizontal lines on each side (date separator style)
   * @default 'default'
   */
  variant?: ChatSystemMessageVariant;

  /**
   * Optional caller-provided icon content associated with the message.
   * Accepts any ReactNode, typically an Icon.
   */
  icon?: ReactNode;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
    textAlign: 'center',
  },
  dividerWrap: {
    width: '100%',
  },
  // Icon
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  // Content wrapper
  content: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1-5'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Centered system message for chat threads.
 *
 * Use for non-sender content: date separators, "conversation started",
 * "user joined", status changes. Supports a divider variant with horizontal
 * lines on each side of the text.
 *
 * It carries no live role: a notice added to a `ChatMessageList` is announced
 * by the list's log, which owns content added inside it (`spec:AST-086` FR4),
 * and a date or divider row is ordinary transcript content.
 *
 * @example
 * ```
 * <ChatSystemMessage>Conversation started</ChatSystemMessage>
 * <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
 * <ChatSystemMessage variant="divider">March 15, 2026</ChatSystemMessage>
 * ```
 */
export function ChatSystemMessage({
  children,
  variant = 'default',
  icon,
  xstyle,
  className,
  style: styleProp,
  ref,
  ...rest
}: ChatSystemMessageProps) {
  if (variant === 'divider') {
    return (
      <div
        ref={ref}
        {...mergeProps(
          themeProps('chat-system-message', {variant}),
          stylex.props(styles.dividerWrap, xstyle),
          className,
          styleProp,
        )}
        {...rest}>
        <Divider label={children} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('chat-system-message', {variant}),
        stylex.props(styles.root, xstyle),
        className,
        styleProp,
      )}
      {...rest}>
      <span {...stylex.props(styles.content)}>
        {isRenderable(icon) && (
          <span {...stylex.props(styles.icon)}>{icon}</span>
        )}
        {children}
      </span>
    </div>
  );
}

ChatSystemMessage.displayName = 'ChatSystemMessage';
