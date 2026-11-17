// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatUnreadDivider.tsx
 * @input Uses React, StyleX, theme tokens
 * @output Exports ChatUnreadDivider component and ChatUnreadDividerProps
 * @position Error-colored rule marking where unread messages begin
 *
 * Thin error-colored rule with a trailing label ("New" by default),
 * rendered as an aria separator between read and unread messages in a
 * chat thread.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Chat/index.ts (exports)
 * - /packages/lab/src/Chat/ChatUnreadDivider.doc.mjs
 * - /apps/storybook/stories/ChatAdditions.stories.tsx (examples)
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
  fontWeightVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import type {BaseProps} from '@astryxdesign/core';
import {mergeProps} from '@astryxdesign/core/utils';
import {themeProps} from '@astryxdesign/core/utils';

export interface ChatUnreadDividerProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Divider label.
   * @default 'New'
   */
  label?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    paddingBlock: spacingVars['--spacing-1'],
  },
  line: {
    flexGrow: 1,
    height: 1,
    backgroundColor: colorVars['--color-error'],
  },
  label: {
    flexShrink: 0,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-bold'],
    color: colorVars['--color-text-error'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Error-colored rule marking the first unread message in a chat thread.
 *
 * Renders as a separator with an accessible label describing where
 * unread messages begin.
 *
 * @example
 * ```
 * <ChatUnreadDivider />
 * <ChatUnreadDivider label="Unread" />
 * ```
 */
export function ChatUnreadDivider({
  label = 'New',
  xstyle,
  className,
  style: styleProp,
  'data-testid': testId,
  ref,
}: ChatUnreadDividerProps) {
  return (
    <div
      ref={ref}
      role="separator"
      aria-label={`${label} messages below`}
      data-testid={testId}
      {...mergeProps(
        themeProps('chat-unread-divider'),
        stylex.props(styles.root, xstyle),
        className,
        styleProp,
      )}>
      <span {...stylex.props(styles.line)} />
      <span {...stylex.props(styles.label)}>{label}</span>
    </div>
  );
}

ChatUnreadDivider.displayName = 'ChatUnreadDivider';
