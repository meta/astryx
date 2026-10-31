// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfoTip.tsx
 * @input Uses React, stylex, Tooltip + Icon from @astryxdesign/core, color/spacing/radius/duration/ease tokens
 * @output Exports InfoTip component, InfoTipProps, InfoTipSize types
 * @position Lab experiment (RFC meta/astryx#3349); core implementation consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/InfoTip/InfoTip.doc.mjs (props table, features)
 * - /packages/lab/src/InfoTip/InfoTip.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/InfoTip/index.ts (exports if types change)
 */

import {type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';

import {Icon, type IconSize} from '@astryxdesign/core/Icon';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {focusOutlineStyles} from '@astryxdesign/core/utils';

/**
 * Size of the info icon. Maps 1:1 to Icon sizes
 * (xsm: 12px, sm: 16px, md: 20px, lg: 24px).
 */
export type InfoTipSize = IconSize;

export interface InfoTipProps {
  /**
   * Content to display in the tooltip.
   * Typically short, non-interactive text. Mirrors Tooltip's `content` prop.
   */
  content: ReactNode;
  /**
   * Accessible name for the trigger button.
   * @default 'More information'
   */
  label?: string;
  /**
   * Size of the info icon.
   * @default 'sm'
   */
  size?: InfoTipSize;
}

const styles = stylex.create({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle',
    padding: spacingVars['--spacing-0-5'],
    margin: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    borderRadius: radiusVars['--radius-full'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: {
      default: colorVars['--color-icon-secondary'],
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        default: null,
        '@media (hover: hover)': colorVars['--color-icon-primary'],
      },
    },
    transitionProperty: 'color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
});

/**
 * An inline info-icon help affordance: a small "i" button that reveals a
 * tooltip on hover, keyboard focus, and tap. Use it next to labels, values,
 * and metrics for permission notes, metric definitions, and field help.
 *
 * The value over hand-composing Icon inside Tooltip is the pre-wired
 * accessible trigger: a real button with an aria-label, Tab-reachable,
 * tooltip on hover AND focus, and Escape dismissal.
 *
 * Composed entirely from core primitives (Tooltip + Icon); the info icon
 * resolves from the global icon registry, so themes can override it.
 *
 * @example
 * ```
 * <InfoTip content="Editors can change this field; viewers cannot." />
 * <InfoTip content="30-day rolling average." label="About this metric" />
 * ```
 */
export function InfoTip({
  content,
  label = 'More information',
  size = 'sm',
}: InfoTipProps): ReactNode {
  // No local Escape handler: the trigger used to stopPropagation the press,
  // which hid the tip but left the browser's close watcher to fire `cancel` on
  // an enclosing Dialog, so one press took both (#5168). Tooltip's own entry in
  // the shared dismissal stack takes it instead.
  return (
    <Tooltip
      content={content}
      // The trigger is a real button, so Tooltip's `auto` touch rule would
      // give the tap to the control and suppress the tooltip. Here the tooltip
      // IS the control's only purpose, so the tap has to open it — otherwise
      // an InfoTip's content is unreachable on a phone.
      touchTrigger="tap">
      <button
        type="button"
        aria-label={label}
        {...stylex.props(focusOutlineStyles.focusVisible, styles.trigger)}>
        <Icon icon="info" size={size} />
      </button>
    </Tooltip>
  );
}

InfoTip.displayName = 'InfoTip';
