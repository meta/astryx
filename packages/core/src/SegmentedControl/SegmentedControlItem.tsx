// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SegmentedControlItem.tsx
 * @input Uses React, StyleX, SegmentedControlContext
 * @output Exports SegmentedControlItem component and SegmentedControlItemProps type
 * @position Child item; renders as a radio button within the segmented control
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SegmentedControl/SegmentedControl.doc.mjs
 * - /packages/core/src/SegmentedControl/index.ts
 * - /packages/core/src/SegmentedControl/SegmentedControl.test.tsx
 * - /packages/cli/assets/templates/blocks/components/SegmentedControl/ (showcase blocks)
 */

import React, {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  sizeVars,
  durationVars,
  easeVars,
  fontWeightVars,
  shadowVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {useSegmentedControlContext} from './SegmentedControlContext';
import type {SegmentedControlSize} from './SegmentedControlContext';
import {mergeProps, composeEventHandlers} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

export interface SegmentedControlItemProps extends BaseProps<HTMLButtonElement> {
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Unique value for this segment. Matched against the parent's value.
   */
  value: string;
  /**
   * Accessible label for this segment (required for accessibility).
   * Used as visible text, or as aria-label when isLabelHidden is true.
   */
  label: string;
  /**
   * Whether the label is visually hidden. When true, only the icon is
   * displayed and the label is used as aria-label for accessibility.
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Icon element displayed before the label.
   */
  icon?: ReactNode;
  /**
   * Whether this individual item is disabled.
   * @default false
   */
  isDisabled?: boolean;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  base: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    whiteSpace: 'nowrap',
    // In both layouts a segment may be narrower than its label, so the
    // label's ellipsis can engage when the control is capped by its container.
    minWidth: 0,
    transitionProperty: 'color, background-color, box-shadow',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  selected: {
    // Forced colors (Windows High Contrast) strips the painted surface fill
    // and box shadow, which would leave the selected segment with no state
    // indication beyond font weight. Highlight/HighlightText is the platform
    // convention for a selected item (WCAG 1.4.11).
    //
    // forced-color-adjust must be `none` here: the segment is a <button>, and
    // the UA keeps native form-control colors (ButtonFace surface) for it under
    // forced colors, ignoring the authored Highlight fill — the label kept its
    // HighlightText color, giving white text on a white surface. Opting the
    // selected segment out of UA remapping makes both the Highlight surface and
    // the HighlightText label render as authored, restoring figure-ground.
    forcedColorAdjust: 'none',
    color: {
      default: colorVars['--color-text-primary'],
      '@media (forced-colors: active)': 'HighlightText',
    },
    fontWeight: fontWeightVars['--font-weight-semibold'],
    backgroundColor: {
      default: colorVars['--color-background-surface'],
      '@media (forced-colors: active)': 'Highlight',
    },
    boxShadow: shadowVars['--shadow-low'],
  },
  disabled: {
    cursor: 'default',
    color: colorVars['--color-text-disabled'],
  },
  fill: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  // An icon-only segment has no label to truncate, so it keeps its size.
  iconOnly: {
    flexShrink: 0,
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  labelText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
});

const CONCENTRIC_RADIUS =
  'max(0px, calc(var(--_segmented-control-radius) - var(--_segmented-control-padding)))';

const sizeStyles = stylex.create({
  sm: {
    height: `calc(${sizeVars['--size-element-sm']} - 4px)`,
    borderRadius: CONCENTRIC_RADIUS,
    paddingInline: spacingVars['--spacing-2'],
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  md: {
    height: `calc(${sizeVars['--size-element-md']} - 4px)`,
    borderRadius: CONCENTRIC_RADIUS,
    paddingInline: spacingVars['--spacing-3'],
  },
  lg: {
    height: `calc(${sizeVars['--size-element-lg']} - 4px)`,
    borderRadius: CONCENTRIC_RADIUS,
    paddingInline: spacingVars['--spacing-3'],
  },
});

const iconSizeStyles = stylex.create({
  sm: {width: '14px', height: '14px'},
  md: {width: '16px', height: '16px'},
  lg: {width: '18px', height: '18px'},
});

/**
 * Individual segment item within an SegmentedControl.
 * Renders as a radio button with visual segment styling.
 *
 * @example
 * ```
 * <SegmentedControlItem value="grid" label="Grid" icon={<GridIcon />} />
 * ```
 */
export function SegmentedControlItem({
  ref,
  value,
  label,
  isLabelHidden = false,
  icon,
  isDisabled = false,
  onClick: onClickProp,
  xstyle,
  ...rest
}: SegmentedControlItemProps) {
  const pressable = usePressFeedback();
  const ctx = useSegmentedControlContext();

  const isSelected = ctx.value === value;
  const isItemDisabled = isDisabled || ctx.isDisabled;
  // When the whole group is disabled with a disabledMessage, keep the selected
  // segment focusable so the group's reason tooltip is keyboard-discoverable.
  // Per-item disabling (`isDisabled` on the item) always drops out of the tab
  // order. Activation stays blocked by the isItemDisabled guard in handleClick.
  const keepsSelectedFocusable =
    isSelected && (ctx.hasDisabledMessage ?? false) && !isDisabled;
  const size: SegmentedControlSize = ctx.size;
  const isFill = ctx.layout === 'fill';

  // Consumer-first: a consumer onClick can call preventDefault() to opt out of
  // selection; otherwise selection proceeds when enabled and not selected.
  // A disabled segment invokes no caller callback (spec:AST-085 FR2), so the
  // consumer onClick is left out while it is disabled, including the selected
  // segment of a group disabled with a reason, which stays focusable.
  const handleClick = composeEventHandlers(
    isItemDisabled ? undefined : onClickProp,
    () => {
      if (!isItemDisabled && !isSelected) {
        ctx.onChange(value);
      }
    },
  );

  const iconElement = icon ? (
    <span {...stylex.props(styles.icon, iconSizeStyles[size])}>{icon}</span>
  ) : null;

  return (
    <button
      ref={ref}
      {...rest}
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-disabled={isItemDisabled || undefined}
      aria-label={isLabelHidden ? label : undefined}
      data-value={value}
      {...(!isSelected && !isItemDisabled ? pressable : undefined)}
      // Disabled items (including when the whole group is disabled) are not tab
      // stops — otherwise the selected segment stays keyboard-focusable but is
      // silently dead (arrows and activation are no-ops) (navigation-13). The
      // exception is a whole-group disabledMessage, where the selected segment
      // stays focusable so the reason tooltip is keyboard-discoverable.
      tabIndex={
        (isSelected && !isItemDisabled) || keepsSelectedFocusable ? 0 : -1
      }
      onClick={handleClick}
      {...mergeProps(
        themeProps('segmented-control-item', {
          size,
          selected: isSelected ? 'selected' : null,
          disabled: isItemDisabled ? 'disabled' : null,
        }),
        focusOutlineProps.focusVisible(
          styles.base,
          sizeStyles[size],
          isFill && styles.fill,
          isLabelHidden && styles.iconOnly,
          isSelected && styles.selected,
          // The shared hover and pressed overlay, on the segments a press can
          // change: the selected segment keeps its raised surface as it is.
          !isSelected &&
            !isItemDisabled &&
            interactionOverlayStyles.backgroundColor,
          isItemDisabled && styles.disabled,
          xstyle,
        ),
      )}>
      {iconElement}
      {!isLabelHidden && (
        <span {...stylex.props(styles.labelText)}>{label}</span>
      )}
    </button>
  );
}

SegmentedControlItem.displayName = 'SegmentedControlItem';
