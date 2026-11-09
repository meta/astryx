// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfoTip.tsx
 * @input Uses React, StyleX, useTooltip, Icon, useComponentTranslator, the
 *   shared touch hit area, color/spacing/radius/duration/ease tokens
 * @output Exports InfoTip component, InfoTipProps, InfoTipSize types
 * @position Core implementation; consumed by index.ts, tested by
 *   InfoTip.test.tsx; `@astryxdesign/lab` re-exports it, deprecated
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/InfoTip/InfoTip.doc.mjs (props table, features)
 * - /docs/specs/components/InfoTip/InfoTip.spec.md (contract)
 * - /packages/core/src/InfoTip/InfoTip.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/InfoTip/index.ts (exports if types change)
 * - /packages/cli/assets/templates/blocks/components/InfoTip/ (showcase and example blocks)
 */

import {
  useCallback,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import type {BaseProps} from '../BaseProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {Icon, type IconSize} from '../Icon/Icon';
import {stopInReactTree} from '../Layer/layerClickBoundary';
import {useTooltip} from '../Tooltip/useTooltip';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/InfoTip/InfoTip.generated';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {mergeProps} from '../utils/mergeProps';
import {useTouchHitArea} from '../utils/touchHitArea';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';

registerEnglishFallback(english);

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
});

/**
 * An info icon that reveals help: a small "i" button. Hover and keyboard
 * focus preview the help. A click, tap, Enter, or Space pins it open until
 * Escape, a second press, a press outside, or focus leaving. Use it next to
 * labels, values, and metrics for permission notes, metric definitions, and
 * field help.
 *
 * InfoTip is a named button that toggles `useTooltip`'s `show()` and `hide()`:
 * the hook previews, holds, announces, and closes the help. The info icon
 * resolves from the icon registry, so themes can replace it.
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
  const t = useComponentTranslator();
  const hitAreaRef = useTouchHitArea(true);
  // Whether a press pinned the help. A hover or focus preview is not pinned.
  const [isPinned, setIsPinned] = useState(false);
  // Whether the help shows, pinned or previewed: the button names it in
  // `aria-controls` only then.
  const [isShown, setIsShown] = useState(false);
  const handleShow = useCallback(() => setIsShown(true), []);
  // Every close ends the pin: a second press, Escape, a press outside, or
  // focus leaving.
  const handleHide = useCallback(() => {
    setIsShown(false);
    setIsPinned(false);
  }, []);
  const tooltip = useTooltip({onShow: handleShow, onHide: handleHide});
  const mergedRef = useMergedRefs(ref, hitAreaRef, tooltip.ref);

  // A primary mouse or pen press on a preview calls show() first. The hook's
  // press-to-close then leaves it open. The click pins it.
  const handlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (
        event.button !== 0 ||
        event.pointerType === 'touch' ||
        isPinned ||
        !isShown
      ) {
        return;
      }
      tooltip.show();
    },
    [isPinned, isShown, tooltip],
  );

  // A click, tap, Enter, or Space pins the help, and the next one closes it.
  // The press stops at the button: a clickable row, card, or label around it
  // does nothing, and document listeners still see it.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stopInReactTree(event);
      event.preventDefault();
      if (isPinned) {
        tooltip.hide();
        return;
      }
      tooltip.show();
      setIsPinned(true);
    },
    [isPinned, tooltip],
  );

  // No Escape handler of its own. The tooltip's entry in the shared dismissal
  // stack takes Escape, so one press never closes both the help and an
  // enclosing Dialog.
  return (
    <>
      <button
        ref={mergedRef}
        type="button"
        aria-label={label ?? t('@astryx.infoTip.label')}
        aria-describedby={tooltip.describedBy}
        aria-expanded={isPinned}
        aria-controls={isShown ? tooltip.describedBy : undefined}
        onPointerDownCapture={handlePointerDownCapture}
        onClick={handleClick}
        {...mergeProps(
          stylex.props(
            focusOutlineStyles.focusVisible,
            styles.trigger,
            touchHitAreaStyles.layer,
            xstyle,
          ),
          className,
          style,
        )}>
        <Icon icon="info" size={size} />
      </button>
      {tooltip.renderTooltip(content)}
    </>
  );
}

InfoTip.displayName = 'InfoTip';
