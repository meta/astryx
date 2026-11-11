// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useContainerReveal.ts
 * @input The containerReveal styles
 * @output useContainerReveal, a headless hover and focus reveal primitive
 * @position Core hook for content that shows or hides when its container is
 *   hovered or focused, such as Thumbnail's remove button
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (export)
 * - containerReveal.stylex.ts (if the style blocks change)
 */

import {useMemo, type CSSProperties} from 'react';
import * as stylex from '@stylexjs/stylex';
import {styles} from './containerReveal.stylex';

export interface UseContainerRevealOptions {
  /**
   * When false the hook is inert: the container gets no styles and content
   * getters return no styles, so content is always shown. Read on every
   * render, so a component can flip it with its own prop (e.g.
   * `revealOn === 'hover'`).
   * @default true
   */
  isEnabled?: boolean;
}

export interface ContainerRevealOptions {
  /**
   * Pin the container's trigger state instead of letting the pointer drive it.
   * `'active'` reads as pointed-at and `'inactive'` as at rest; omit it — the
   * default — to leave the container on hover and focus.
   *
   * State, not appearance: what each child then looks like is the child's own
   * business (revealed content fades in on `'active'`, inverted content fades
   * out). This is the lever for state a caller owns — a motion gate over a
   * list, a scroll in progress, a row whose menu is open and must stay lit.
   *
   * `'inactive'` never overrides keyboard focus or a coarse pointer: the
   * container still reveals on :focus-within and stays revealed on touch, so
   * it cannot hide content from a keyboard or touch user.
   */
  forceState?: 'active' | 'inactive';
  /**
   * Hover-intent gate, in milliseconds: how long the pointer must rest on the
   * container before the reveal starts. A pointer that passes through leaves
   * nothing painted behind it, which is what keeps a list of rows quiet while
   * the cursor sweeps across it.
   *
   * Mouse-only, like Tooltip's and HoverCard's `delay`: keyboard focus and
   * touch reveal immediately. It survives `prefers-reduced-motion` — an intent
   * gate is timing, not motion.
   * @default 0
   */
  hoverDelay?: number;
}

export interface ContentRevealOptions {
  /**
   * Conceal-on-hover instead of reveal-on-hover: content is visible at rest
   * and fades out while the container is hovered. Mouse-only and visual —
   * stays in the a11y tree, ignores focus-within, stays visible on touch.
   * @default false
   */
  isRevealInverted?: boolean;
  /**
   * Reserve the content's layout box while hidden (opacity-only) instead of
   * collapsing it, to avoid layout shift when it appears.
   * @default false
   */
  isLayoutPreserved?: boolean;
  /**
   * Pin THIS element's appearance, whatever the container's state: `'shown'`
   * keeps it visible, `'hidden'` keeps it out. Omit it — the default — to
   * follow the container.
   *
   * Appearance, not state: it says how one element looks, so it is unambiguous
   * where the container's `forceState` cannot be (a container feeds revealed
   * and inverted children at once).
   *
   * `'hidden'` yields to focus — a forced-hidden element is still mounted and
   * tabbable, so it reappears when focus lands inside it.
   */
  forceVisibility?: 'shown' | 'hidden';
}

export interface UseContainerRevealReturn {
  /** Spread onto the container whose hover/focus-within drives the reveal. */
  getContainerProps: (options?: ContainerRevealOptions) => {
    className?: string;
    style?: CSSProperties;
  };
  /** Spread onto each revealed / concealed child. */
  getContentRevealProps: (options?: ContentRevealOptions) => {
    className?: string;
    style?: CSSProperties;
  };
}

const EMPTY = Object.freeze({});

/**
 * Scoped, CSS-only hover/focus reveal for content inside a container.
 *
 * Revealed content stays in the accessibility tree and the tab order. It
 * shows on :focus-within without a delay, and it always shows on touch.
 * Concealed content hides only for a mouse. Motion honors
 * prefers-reduced-motion.
 *
 * @example
 * ```
 * const {getContainerProps, getContentRevealProps} = useContainerReveal({
 *   isEnabled: revealOn === 'hover',
 * });
 *
 * <div
 *   {...mergeProps(
 *     getContainerProps({hoverDelay: 120, forceState: gateState}),
 *     stylex.props(styles.row),
 *   )}>
 *   {label}
 *   <span {...mergeProps(getContentRevealProps(), stylex.props(styles.actions))}>
 *     {actions}
 *   </span>
 * </div>
 * ```
 */
export function useContainerReveal(
  options: UseContainerRevealOptions = {},
): UseContainerRevealReturn {
  const {isEnabled = true} = options;

  return useMemo(() => {
    if (!isEnabled) {
      return {
        getContainerProps: () => EMPTY,
        getContentRevealProps: () => EMPTY,
      };
    }
    return {
      getContainerProps: (containerOptions: ContainerRevealOptions = {}) => {
        const {forceState, hoverDelay = 0} = containerOptions;
        return stylex.props(
          styles.container,
          hoverDelay > 0 && styles.hoverDelay(`${hoverDelay}ms`),
          forceState === 'inactive' && styles.stateInactive,
          forceState === 'active' && styles.stateActive,
        );
      },
      getContentRevealProps: (contentOptions: ContentRevealOptions = {}) => {
        const {
          isRevealInverted = false,
          isLayoutPreserved = false,
          forceVisibility,
        } = contentOptions;
        const style = isRevealInverted
          ? isLayoutPreserved
            ? styles.concealLayoutPreserved
            : styles.conceal
          : isLayoutPreserved
            ? styles.revealLayoutPreserved
            : styles.reveal;
        return stylex.props(
          style,
          forceVisibility === 'shown' && styles.contentShown,
          forceVisibility === 'hidden' &&
            (isLayoutPreserved
              ? styles.contentHiddenLayoutPreserved
              : styles.contentHidden),
        );
      },
    };
  }, [isEnabled]);
}
