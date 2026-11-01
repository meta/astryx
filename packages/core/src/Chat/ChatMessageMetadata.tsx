// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatMessageMetadata.tsx
 * @input Uses React, StyleX, ChatContext, Icon, theme tokens, and isRenderable
 * @output Exports ChatMessageMetadata component
 * @position Shared metadata row used by composing inside ChatMessage
 *
 * Renders timestamp, footer, and status values with separators determined by
 * scalar presence. Direction reverses for user sender.
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typeScaleVars,
  fontWeightVars,
} from '../theme/tokens.stylex';
import {useChatMessageContext} from './ChatContext';
import {Icon} from '../Icon';
import type {IconName} from '../Icon/globalIconRegistry';
import {isRenderable, mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

export type ChatMessageStatus =
  'sending' | 'sent' | 'delivered' | 'read' | 'error';

const STATUS_CONFIG: Record<
  ChatMessageStatus,
  {icon: IconName; i18nKey: string}
> = {
  sending: {icon: 'clock', i18nKey: '@astryx.chat.status.sending'},
  sent: {icon: 'check', i18nKey: '@astryx.chat.status.sent'},
  delivered: {icon: 'checkDouble', i18nKey: '@astryx.chat.status.delivered'},
  read: {icon: 'checkDouble', i18nKey: '@astryx.chat.status.read'},
  error: {icon: 'error', i18nKey: '@astryx.chat.status.failed'},
};

const pulseKeyframes = stylex.keyframes({
  '0%, 100%': {opacity: 1},
  '50%': {opacity: 0.5},
});

const styles = stylex.create({
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    marginBlockStart: spacingVars['--spacing-1'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  metaUser: {
    flexDirection: 'row-reverse',
  },
  metaAssistant: {
    flexDirection: 'row',
  },
  statusRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
  },
  statusError: {
    color: colorVars['--color-text-error'],
  },
  statusPulse: {
    animationName: pulseKeyframes,
    animationDuration: '1.5s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
});

export interface ChatMessageMetadataProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /** Timestamp content — ReactNode (e.g. Timestamp) or string. */
  timestamp?: ReactNode;
  /** Footer content — model info, ratings, reactions. */
  footer?: ReactNode;
  /** Message delivery status. */
  status?: ChatMessageStatus;
}

/**
 * Composable metadata row for chat messages.
 *
 * Renders: timestamp · footer · status
 * Renders nothing when neither slot passes the scalar-presence check and no
 * status is set. Composite React nodes remain caller-owned.
 *
 * @example
 * ```
 * <ChatMessage sender="user">
 *   <ChatMessageBubble>Hello!</ChatMessageBubble>
 *   <ChatMessageMetadata timestamp={<Timestamp value="..." format="time" />} status="read" />
 * </ChatMessage>
 * ```
 */
export function ChatMessageMetadata({
  ref,
  timestamp,
  footer,
  status,
  xstyle,
  className,
  style,
  ...rest
}: ChatMessageMetadataProps) {
  const t = useTranslator();
  const msgContext = useChatMessageContext();
  const sender = msgContext?.sender ?? 'assistant';

  const statusConfig = status != null ? STATUS_CONFIG[status] : null;
  const statusLabel = statusConfig != null ? t(statusConfig.i18nKey) : '';

  const hasTimestamp = isRenderable(timestamp);
  const hasFooter = isRenderable(footer);
  const hasContent = hasTimestamp || hasFooter || statusConfig != null;
  if (!hasContent) {
    return null;
  }

  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('chat-message-metadata'),
        stylex.props(
          styles.meta,
          sender === 'user' ? styles.metaUser : styles.metaAssistant,
          xstyle,
        ),
        className,
        style,
      )}
      {...rest}>
      {hasTimestamp && <span>{timestamp}</span>}
      {hasTimestamp && (hasFooter || statusConfig != null) && <span>·</span>}
      {hasFooter && footer}
      {hasFooter && statusConfig != null && <span>·</span>}
      {statusConfig != null && (
        <span
          title={statusLabel}
          aria-label={t('@astryx.chat.messageAriaLabel', {
            status: statusLabel.toLowerCase(),
          })}
          {...stylex.props(
            styles.statusRow,
            status === 'error' && styles.statusError,
            status === 'sending' && styles.statusPulse,
          )}>
          <Icon icon={statusConfig.icon} size="xsm" color="inherit" />
          <span>{statusLabel}</span>
        </span>
      )}
    </div>
  );
}

ChatMessageMetadata.displayName = 'ChatMessageMetadata';
