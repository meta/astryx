// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file AvatarGroupOverflow.tsx
 * @input Uses React, StyleX, AvatarGroupContext, i18n (useTranslator)
 * @output Exports AvatarGroupOverflow for overflow indicator
 * @position Slot component used inside AvatarGroup
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/AvatarGroup/AvatarGroup.doc.mjs
 * - /packages/core/src/AvatarGroup/index.ts
 * - /apps/storybook/stories/AvatarGroupOverflow.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/AvatarGroup/ (showcase blocks)
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  typographyVars,
  typeScaleVars,
  fontWeightVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {shapeStyles} from '../Avatar/Avatar';
import {mergeProps} from '../utils';
import {resolveSize} from '../Avatar';
import {useAvatarGroup} from './AvatarGroupContext';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useTranslator} from '../i18n';

const BORDER_WIDTH = 2;
const OVERFLOW_FONT_RATIO = 0.35;

export interface AvatarGroupOverflowProps extends Omit<
  BaseProps<HTMLElement>,
  'onClick'
> {
  ref?: React.Ref<HTMLElement>;
  /**
   * The overflow count to display.
   */
  count: number;

  /**
   * Callback fired when the overflow indicator is clicked.
   * When provided, the indicator renders as a focusable button.
   */
  onClick?: () => void;

  /**
   * Custom content to render instead of the default "+N" label.
   */
  children?: ReactNode;
}

const styles = stylex.create({
  base: {
    position: 'relative',
    // inline-flex, not flex: outside an AvatarGroup this span is not a flex
    // item, and a block-level flex container stretches to its parent's width
    // instead of staying a circle.
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Reads the shape variant's `--_avatar-radius` (set via `shapeStyles`,
    // shared with Avatar) so the overflow indicator matches the group's
    // shape instead of always staying a circle.
    borderRadius: 'var(--_avatar-radius)',
    // Use opaque background to prevent avatar bleed-through
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    userSelect: 'none',
    borderWidth: BORDER_WIDTH,
    borderStyle: 'solid',
    borderColor: colorVars['--color-background-surface'],
    // border-box so the border and inline padding are included in the box
    // size: a short "+N" stays a circle at exactly the avatar size, while
    // longer content pushes past the min width and grows into a pill.
    boxSizing: 'border-box',
    // Horizontal breathing room so multi-digit "+N" counts don't crowd the
    // edges once the indicator grows into a pill.
    paddingInline: spacingVars['--spacing-2'],
    // Neutral tint layer (preserves opaque base underneath)
    backgroundImage: `linear-gradient(${colorVars['--color-neutral']}, ${colorVars['--color-neutral']})`,
  },
  button: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // Reset the UA button's block padding only; the inline padding from `base`
    // provides the pill's breathing room and must be preserved.
    paddingBlock: 0,
    // Focus ring via focus-visible
  },
  overlap: {
    // Matches Avatar's own overlap rule. AvatarGroup pads its start edge by
    // the same amount, so the indicator stays inside the group's box even
    // when it is the first child.
    marginInlineStart: 'var(--_avatar-group-overlap)',
  },
});

const dynamicStyles = stylex.create({
  size: (s: number) => ({
    // Pin height to the avatar's rendered size and enforce the same value as a
    // *minimum* width, so short counts (`+5`) render a perfect circle. With
    // border-box, the inline padding lives inside this size; longer content
    // (`+4912`) pushes past the min width and grows into a stadium/pill.
    // The border is added to the declared size (like the avatars' ring, which
    // uses content-box + a 2px border) to keep the indicator the same overall
    // size as its sibling avatars.
    minWidth: s + BORDER_WIDTH * 2,
    height: s + BORDER_WIDTH * 2,
  }),
  fontSize: (s: number) => ({
    // Scales with the avatar, but never below the supporting-text role token,
    // which is the 12px legibility floor. At xsm the bare ratio computes 7px,
    // where the glyph stroke is thinner than a pixel and never reaches its
    // own text colour (measured 1.63:1 against a 4.5:1 requirement).
    fontSize: `max(${typeScaleVars['--text-supporting-size']}, ${
      s * OVERFLOW_FONT_RATIO
    }px)`,
  }),
  overlap: (offset: number) => ({
    '--_avatar-group-overlap': `${offset}px`,
  }),
});

/**
 * Overflow indicator for AvatarGroup. Shows a "+N" count and
 * optionally handles clicks.
 *
 * @example
 * ```
 * <AvatarGroup size="lg">
 *   {users.slice(0, 3).map(u => (
 *     <Avatar key={u.id} src={u.src} name={u.name} />
 *   ))}
 *   <AvatarGroupOverflow count={users.length - 3} onClick={showAll} />
 * </AvatarGroup>
 * ```
 */
export function AvatarGroupOverflow({
  ref,
  count,
  onClick,
  children,
  xstyle,
  className,
  style,
  ...rest
}: AvatarGroupOverflowProps): ReactNode {
  const pressable = usePressFeedback();
  const t = useTranslator();
  const group = useAvatarGroup();
  const size = group?.size ?? 'md';
  const shape = group?.shape ?? 'circle';
  const numericSize = group?.numericSize ?? resolveSize('md');
  const overlap = group?.overlap ?? 0;

  // count is a plain number, and the documented shape for it is
  // `total - visibleCount`, which goes negative whenever the list is shorter
  // than the slice. Clamping keeps that from rendering "+-3".
  const safeCount = Math.max(0, count);
  const label = t('@astryx.avatarGroup.overflow', {count: safeCount});
  const content = children ?? `+${safeCount}`;

  if (onClick) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        {...rest}
        aria-label={label}
        data-avatar-item=""
        {...pressable}
        {...mergeProps(
          themeProps('avatar-group-overflow', {size, shape}),
          focusOutlineProps.focusVisible(
            styles.base,
            styles.button,
            interactionOverlayStyles.backgroundImageOnNeutral,
            styles.overlap,
            dynamicStyles.size(numericSize),
            dynamicStyles.fontSize(numericSize),
            dynamicStyles.overlap(-overlap),
            shapeStyles[shape],
            xstyle,
          ),
          className,
          style,
        )}>
        {content}
      </button>
    );
  }

  return (
    <span
      ref={ref}
      // Before the caller's props so a caller-supplied role still wins.
      role="img"
      {...rest}
      aria-label={label}
      {...mergeProps(
        themeProps('avatar-group-overflow', {size, shape}),
        stylex.props(
          styles.base,
          styles.overlap,
          dynamicStyles.size(numericSize),
          dynamicStyles.fontSize(numericSize),
          dynamicStyles.overlap(-overlap),
          shapeStyles[shape],
          xstyle,
        ),
        className,
        style,
      )}>
      {content}
    </span>
  );
}

AvatarGroupOverflow.displayName = 'AvatarGroupOverflow';
