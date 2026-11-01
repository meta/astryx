// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatLayoutScrollButton.tsx
 * @input Uses React, StyleX, Button, Icon, theme tokens
 * @output Exports ChatLayoutScrollButton component
 * @position Composable scroll-to-bottom button for use inside ChatLayout
 *
 * Renders inside the layout's dock container. Fades in when visible,
 * expands to show a label when provided (e.g. "New messages").
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/index.ts (exports)
 * - /packages/cli/assets/templates/blocks/components/ChatLayoutScrollButton/ (block examples)
 */

import React from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  shadowVars,
  sizeVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {Icon} from '../Icon';
import {Button} from '../Button';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';

// =============================================================================
// Types
// =============================================================================

export interface ChatLayoutScrollButtonProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onClick'
> {
  ref?: React.Ref<HTMLDivElement>;
  /** Whether the button is visible. */
  isVisible: boolean;
  /** Optional label — expands the button (e.g. "New messages"). */
  label?: string;
  /** Click handler. */
  onClick: () => void;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    paddingBlockEnd: spacingVars['--spacing-3'],
  },
  container: {
    pointerEvents: 'auto',
    contain: 'layout style',
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-background-popover'],
    boxShadow: shadowVars['--shadow-med'],
    // The pill clips its own content, so it must track the height of the
    // md Button it wraps. A literal would clip that Button under any theme
    // that retunes the element scale.
    height: sizeVars['--size-element-md'],
    // `visibility` rides the same transition so the fade-out still plays:
    // it flips to `visible` immediately on the way in and only at the end
    // of the duration on the way out.
    transitionProperty: 'opacity, transform, max-width, visibility',
    transitionTimingFunction: easeVars['--ease-standard'],
    transitionDuration: {
      default: durationVars['--duration-fast-max'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none',
    // The hidden pill paints nothing, so focus landing on it would have no
    // visible indicator (WCAG 2.2 SC 2.4.7). `visibility` removes it from
    // sequential navigation after the fade; `inert` immediately prevents new
    // focus and makes an already-focused descendant relinquish focus.
    visibility: 'hidden',
    maxWidth: sizeVars['--size-element-md'],
  },
  visible: {
    opacity: 1,
    pointerEvents: 'auto',
    visibility: 'visible',
  },
  collapsed: {
    maxWidth: sizeVars['--size-element-md'],
  },
  expanded: {
    maxWidth: '200px',
  },
  button: {
    [radiusVars['--radius-element'] as string]: radiusVars['--radius-full'],
    whiteSpace: 'nowrap',
    paddingInline: spacingVars['--spacing-2'],
  },
  // When a label is shown, the icon sits on the leading edge and the text on
  // the trailing edge. Symmetric padding leaves the text cramped against the
  // pill's rounded edge, so give the trailing side extra breathing room.
  buttonWithLabel: {
    paddingInlineEnd: spacingVars['--spacing-3'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * Floating scroll-to-bottom button for use inside ChatLayout.
 *
 * @example
 * ```
 * <ChatLayoutScrollButton isVisible={!isAtBottom} onClick={scrollToBottom} />
 * ```
 */
export function ChatLayoutScrollButton({
  ref,
  isVisible,
  label,
  onClick,
  xstyle,
  className,
  style,
  ...rest
}: ChatLayoutScrollButtonProps) {
  const t = useTranslator();
  return (
    // Two elements, two responsibilities. The outer one centres the pill and
    // holds the gap above the composer — spacing outside the pill's border
    // box, which the pill cannot own itself. The inner one is the pill: it is
    // what a reader sees, so it carries the painted surface AND the public
    // theming target. Keeping the target on the outer element would satisfy
    // every automated check while leaving a theme styling an invisible
    // full-width row (architecture:component-theming-surface INV4).
    <div
      ref={ref}
      {...mergeProps(stylex.props(styles.wrapper, xstyle), className, style)}
      {...rest}>
      <div
        inert={!isVisible}
        {...mergeProps(
          themeProps('chat-layout-scroll-button'),
          stylex.props(
            styles.container,
            isVisible ? styles.visible : styles.hidden,
            label ? styles.expanded : styles.collapsed,
          ),
        )}>
        <Button
          label={label ?? t('@astryx.chatLayoutScrollButton.scrollToBottom')}
          aria-label={
            label ?? t('@astryx.chatLayoutScrollButton.scrollToBottom')
          }
          icon={<Icon icon="chevronDown" size="md" />}
          variant="ghost"
          size="md"
          isIconOnly={!label}
          onClick={onClick}
          xstyle={[styles.button, label ? styles.buttonWithLabel : null]}>
          {label ?? undefined}
        </Button>
      </div>
    </div>
  );
}

ChatLayoutScrollButton.displayName = 'ChatLayoutScrollButton';
