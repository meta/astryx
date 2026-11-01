// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfoTip.tsx
 * @input Uses React, StyleX, Tooltip, Icon, useTranslator, the shared touch
 *   hit area, color/spacing/radius/duration/ease tokens
 * @output Exports InfoTip component, InfoTipProps, InfoTipSize types
 * @position Core implementation; consumed by index.ts, tested by
 *   InfoTip.test.tsx; `@astryxdesign/lab` re-exports it, deprecated
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/InfoTip/InfoTip.doc.mjs (props table, features)
 * - /packages/core/src/InfoTip/InfoTip.spec.md (contract)
 * - /packages/core/src/InfoTip/InfoTip.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/InfoTip/index.ts (exports if types change)
 */

import {useEffect, useRef, type ReactNode, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '../BaseProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {Icon, type IconSize} from '../Icon/Icon';
import {Tooltip} from '../Tooltip/Tooltip';
import {useTranslator} from '../i18n/useTranslator';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {mergeProps} from '../utils/mergeProps';
import {watchHitArea, writeHitInsets} from '../utils/hitArea';

/**
 * Size of the info icon. Maps 1:1 to Icon sizes
 * (xsm: 12px, sm: 16px, md: 20px, lg: 24px).
 */
export type InfoTipSize = IconSize;

export interface InfoTipProps extends Pick<
  BaseProps,
  'xstyle' | 'className' | 'style'
> {
  /** Ref forwarded to the info button. */
  ref?: Ref<HTMLButtonElement>;
  /**
   * The help the button reveals. Short, noninteractive text; for links or
   * buttons, use HoverCard.
   */
  content: ReactNode;
  /**
   * Accessible name of the button.
   * @default A translated "More information"
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
    position: 'relative',
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
  // The invisible hit area: under a coarse pointer the shared hit area writes
  // how far the button may grow toward 44 px on each side without taking a
  // neighbour's tap (0 elsewhere), and this layer takes taps out to there.
  // SYNC: /packages/core/src/utils/hitArea.ts (HIT_INSET_PROPERTIES)
  hitArea: {
    '::after': {
      content: '""',
      position: 'absolute',
      // Physical sides on purpose: the shared hit area measures each side
      // from the page's rects, left and right included, in any direction.
      inset:
        'calc(var(--astryx-hit-inset-top, 0px) * -1) calc(var(--astryx-hit-inset-right, 0px) * -1) calc(var(--astryx-hit-inset-bottom, 0px) * -1) calc(var(--astryx-hit-inset-left, 0px) * -1)',
    },
  },
});

/**
 * An info icon that reveals help: a small "i" button. Hover and keyboard
 * focus preview the help, and a click, tap, Enter, or Space pins it open
 * until Escape, a second press, a press outside, or focus leaving. Use it
 * next to labels, values, and metrics for permission notes, metric
 * definitions, and field help.
 *
 * InfoTip is Tooltip with `pressTrigger="toggle"` on a named button: Tooltip
 * opens, pins, announces, and closes the help. The info icon resolves from
 * the icon registry, so themes can replace it.
 *
 * @example
 * ```
 * <InfoTip content="Editors can change this field; viewers cannot." />
 * <InfoTip content="30-day rolling average." label="About this metric" />
 * ```
 */
export function InfoTip({
  content,
  label,
  size = 'sm',
  ref,
  xstyle,
  className,
  style,
}: InfoTipProps): ReactNode {
  const t = useTranslator();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mergedRef = useMergedRefs(ref, buttonRef);

  // Under a coarse pointer the button takes taps out toward 44 px (AR1).
  useEffect(() => {
    const button = buttonRef.current;
    if (button == null) {
      return;
    }
    return watchHitArea(button, insets => writeHitInsets(button, insets));
  }, []);

  // No Escape handler of its own: Tooltip's entry in the shared dismissal
  // stack takes Escape, so one press never closes both the help and an
  // enclosing Dialog.
  return (
    <Tooltip
      content={content}
      // The tooltip IS the button's only purpose: a click, a tap, Enter, or
      // Space pins it open and the press stops at the button, so an InfoTip's
      // content is reachable on a phone and from the keyboard alike.
      pressTrigger="toggle">
      <button
        ref={mergedRef}
        type="button"
        aria-label={label ?? t('@astryx.infoTip.label')}
        {...mergeProps(
          stylex.props(
            focusOutlineStyles.focusVisible,
            styles.trigger,
            styles.hitArea,
            xstyle,
          ),
          className,
          style,
        )}>
        <Icon icon="info" size={size} />
      </button>
    </Tooltip>
  );
}

InfoTip.displayName = 'InfoTip';
