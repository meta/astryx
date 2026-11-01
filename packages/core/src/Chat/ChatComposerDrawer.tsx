// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ChatComposerDrawer.tsx
 * @input Uses React, StyleX, theme tokens
 * @output Exports ChatComposerDrawer component
 * @position Collapsible drawer panel for ChatComposer.
 *   Supports expanded (full content) and collapsed (default or caller-composed
 *   summary) states with fade animation and grid-template-rows height transition.
 *   The collapse toggle exposes aria-expanded + aria-controls linking it to
 *   the content region (disclosure pattern).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/ChatComposerDrawer.test.tsx
 * - /packages/core/src/Chat/ChatComposerDrawer.doc.mjs
 * - /docs/specs/components/Chat/ChatComposerDrawer.spec.md
 * - /apps/storybook/stories/ChatComposerDrawer.stories.tsx
 * - /packages/core/src/Chat/index.ts (exports)
 * - /packages/cli/assets/templates/blocks/components/ChatComposerDrawer/ (block examples)
 */

import {useId, useState, type ReactNode} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {Badge} from '../Badge';
import {mergeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {useTranslator} from '../i18n';

export interface ChatComposerDrawerProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content to render inside the drawer — attachments, context chips, previews, etc.
   */
  children: ReactNode;
  /**
   * Total item count — shown in the collapsed badge.
   * When omitted, the component doesn't support collapse.
   */
  count?: number;
  /**
   * Label shown next to the count in the default collapsed summary and used to
   * name the expand/collapse action.
   * @default 'Items'
   */
  label?: string;
  /**
   * Visual content for the canonical Collapsed summary anatomy part. Replaces
   * the complete default Badge and label when count enables collapse. The
   * component keeps this content presentation-only and owns disclosure
   * semantics and accessible naming.
   */
  collapsedSummary?: ReactNode;
  /**
   * Whether the drawer is collapsed.
   * Uncontrolled by default (internal toggle).
   */
  isCollapsed?: boolean;
  /**
   * Default collapsed state for uncontrolled usage.
   * @default false
   */
  defaultIsCollapsed?: boolean;
  /**
   * Callback when collapsed state changes.
   */
  onCollapsedChange?: (isCollapsed: boolean) => void;

  /**
   * StyleX styles for layout customization (margins, positioning, sizing).
   * Must be a `stylex.create()` value — not an inline style object.
   *
   * @example
   * ```
   * const styles = stylex.create({ wrapper: { marginTop: 8 } });
   * <ChatComposerDrawer xstyle={styles.wrapper}>
   *   <AttachmentThumbnail />
   * </ChatComposerDrawer>
   * ```
   */
  xstyle?: StyleXStyles;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

const styles = stylex.create({
  root: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    paddingInline: spacingVars['--spacing-4'],
    paddingBlockStart: spacingVars['--spacing-3'],
    // The drawer tucks behind the composer (negative marginBlockEnd) and its
    // top corners align with the composer's outer radius. Tracks the chat
    // radius to stay matched to the composer, decoupled from --radius-page. #2072
    paddingBlockEnd: `calc(${spacingVars['--spacing-3']} + ${radiusVars['--radius-chat']})`,
    marginBlockEnd: `calc(-1 * ${radiusVars['--radius-chat']})`,
    // Surface base with a muted tint layered on top, both in the element's
    // own background layer. The muted backgroundImage composites over the
    // surface backgroundColor and — by CSS rule — paints behind all in-flow
    // content (tokens, labels, collapse handle) automatically. This restores
    // the original "surface bg + muted tint" intent (#1182) without a
    // positioned ::before, so it needs no z-index and works whether muted is
    // opaque or translucent.
    backgroundColor: colorVars['--color-background-surface'],
    backgroundImage: `linear-gradient(${colorVars['--color-background-muted']}, ${colorVars['--color-background-muted']})`,
    borderStartStartRadius: radiusVars['--radius-chat'],
    borderStartEndRadius: radiusVars['--radius-chat'],
  },

  // Toggle row — both the collapsed summary and bar handle live in the same
  // grid cell so they crossfade without layout shift.
  toggleRow: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    alignItems: 'center',
    height: spacingVars['--spacing-5'],
    paddingInline: spacingVars['--spacing-4'],
    marginInline: `calc(-1 * ${spacingVars['--spacing-4']})`,
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    userSelect: 'none',
  },
  toggleCollapsed: {},
  toggleContent: {
    gridRow: 1,
    gridColumn: 1,
    justifySelf: 'start',
    display: 'inline-flex',
    alignItems: 'center',
    pointerEvents: 'none',
    height: spacingVars['--spacing-5'],
    gap: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-full'],
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  toggleContentHidden: {
    opacity: 0,
    pointerEvents: 'none' as const,
  },
  collapseLabel: {
    color: {
      default: colorVars['--color-text-secondary'],
      [stylex.when.ancestor(':hover')]: {
        '@media (hover: hover)': colorVars['--color-text-primary'],
      },
    },
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: spacingVars['--spacing-5'],
    transitionProperty: 'color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  collapseBarHandle: {
    gridRow: 1,
    gridColumn: 1,
    justifySelf: 'center',
    alignSelf: 'start',
    width: spacingVars['--spacing-5'],
    height: spacingVars['--spacing-0-5'],
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: {
      default: colorVars['--color-icon-secondary'],
      [stylex.when.ancestor(':hover')]: {
        '@media (hover: hover)': colorVars['--color-icon-primary'],
      },
    },
    opacity: 1,
    transitionProperty: 'background-color, opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  collapseBarHandleHidden: {
    opacity: 0,
    pointerEvents: 'none' as const,
  },

  // Animated content area — height collapses via grid-template-rows,
  // items stay in place and fade in/out (no translateY slide).
  contentGrid: {
    display: 'grid',
    gridTemplateRows: '1fr',
    transitionProperty: 'grid-template-rows',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  contentGridCollapsed: {
    gridTemplateRows: '0fr',
  },
  content: {
    minHeight: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-1'],
    alignItems: 'flex-start',
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-medium'],
    transitionDelay: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  contentCollapsed: {
    opacity: 0,
    transitionDelay: '0ms',
    transitionDuration: durationVars['--duration-fast'],
  },
});

/**
 * Collapsible drawer panel for a chat composer.
 * Use for attachments, context chips, or any supplementary content above the input.
 *
 * @example
 * ```
 * <ChatComposerDrawer count={3}>
 *   <AttachmentThumbnail />
 *   <AttachmentThumbnail />
 * </ChatComposerDrawer>
 * ```
 */
export function ChatComposerDrawer({
  ref,
  children,
  count,
  label: labelFromProps,
  collapsedSummary,
  isCollapsed: controlledCollapsed,
  defaultIsCollapsed = false,
  onCollapsedChange,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...htmlProps
}: ChatComposerDrawerProps): React.ReactElement {
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.chat.composerDrawer.label');
  const [internalCollapsed, setInternalCollapsed] =
    useState(defaultIsCollapsed);
  const isControlled = controlledCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledCollapsed : internalCollapsed;

  const canCollapse = count != null;

  // Links the toggle to the region it shows/hides so assistive tech can move
  // from the button to its controlled content (disclosure pattern). The
  // content stays mounted while collapsed (hidden via the grid-row collapse),
  // so the reference always resolves.
  const contentId = useId();

  const toggle = () => {
    const next = !isCollapsed;
    if (!isControlled) {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  return (
    <div
      ref={ref}
      data-testid={testId}
      {...mergeProps(
        themeProps('chat-composer-drawer', {
          collapsed: isCollapsed ? 'collapsed' : null,
        }),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...htmlProps}>
      {canCollapse && (
        <div
          {...focusOutlineProps.focusVisible(
            styles.toggleRow,
            isCollapsed && styles.toggleCollapsed,
            stylex.defaultMarker(),
          )}
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          aria-label={
            isCollapsed
              ? t('@astryx.chatComposerDrawer.expand', {label})
              : t('@astryx.chatComposerDrawer.collapse', {label})
          }
          onClick={toggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle();
            }
          }}>
          <div
            aria-hidden="true"
            inert
            {...stylex.props(
              styles.toggleContent,
              !isCollapsed && styles.toggleContentHidden,
            )}>
            {collapsedSummary === undefined ? (
              <>
                <Badge variant="neutral" label={count} />
                <span {...stylex.props(styles.collapseLabel)}>{label}</span>
              </>
            ) : (
              collapsedSummary
            )}
          </div>
          <div
            {...stylex.props(
              styles.collapseBarHandle,
              isCollapsed && styles.collapseBarHandleHidden,
            )}
          />
        </div>
      )}

      <div
        id={contentId}
        // The 0fr row keeps the collapse animation in place. `inert` also
        // removes visually hidden descendants from keyboard and assistive-
        // technology navigation until the drawer expands again.
        inert={canCollapse && isCollapsed ? true : undefined}
        {...stylex.props(
          styles.contentGrid,
          canCollapse && isCollapsed && styles.contentGridCollapsed,
        )}>
        <div
          {...stylex.props(
            styles.content,
            canCollapse && isCollapsed && styles.contentCollapsed,
          )}>
          {children}
        </div>
      </div>
    </div>
  );
}

ChatComposerDrawer.displayName = 'ChatComposerDrawer';
