// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheetPanel.tsx
 * @input Uses React, StyleX, theme tokens, text/provider boundaries, container padding, sheet gestures, shared scroll behavior, and the host label
 * @output Internal BottomSheetPanel with a keyboard-reachable scrolling body and motion-state types
 * @position Shared presentation layer for standalone and switcher
 *   BottomSheets. It owns the sheet surface and the body's keyboard access.
 *   The host owns dialog focus, inert state and switcher registration.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/BottomSheet/BottomSheet.tsx
 * - /packages/core/src/BottomSheet/BottomSheetPanel.test.tsx
 * - /packages/core/src/BottomSheet/snapOffsets.ts
 * - /packages/core/src/keyboard/useMobileKeyboard.ts
 * - /packages/core/src/BottomSheet/useSheetGestures.ts
 * - /packages/core/src/Layout/container.stylex.ts (bottom-sheet padding chain)
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {useDevWarning} from '../hooks/useDevWarning';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {useScrollableArea} from '../hooks/useScrollableArea';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  focusVars,
  radiusVars,
  shadowVars,
  sizeVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {layerTextReset} from '../Layer/layerTextReset.stylex';
import {layerStructureReset} from '../Layer/layerStructureReset.stylex';
import {LayerContentBoundary} from '../Layer/layerScopedContext';
import {container} from '../Layout/container.stylex';
import type {SpacingToken} from '../Layout/container.stylex';
import {
  containerPaddingBlockEndVarStyles,
  containerPaddingInlineVarStyles,
  overlayPaddingReset,
  paddingStyles,
  spacingStepToToken,
} from '../Layout/padding.stylex';
import {subscribeInput} from '../utils/inputStream';
import type {SpacingStep} from '../utils/types';
import {
  isValidSnapPoint,
  resolveSnapPoints,
  type BottomSheetSnapPoint,
} from './snapOffsets';
import {animatorFor, SETTLE_THRESHOLD} from '../motion/animator';
import {resolveSettleMs} from '../motion/resolveMotion';
import {springs} from '../motion/uikit/springs';
import {useMobileKeyboard} from '../keyboard/useMobileKeyboard';
import {
  scrollPreservationPadding,
  sheetLayoutHeight,
  useSheetGestures,
  type SheetDragExit,
} from './useSheetGestures';

const HEIGHT_BUDGETS = {
  hug: '92dvh',
  capped: '62dvh',
  tall: '92dvh',
} as const;

export type BottomSheetHeight = keyof typeof HEIGHT_BUDGETS;
export type {BottomSheetSnapPoint};

// The reserve: how far the sheet's surface reaches below the screen, so a
// pull past the top never shows the page under it.
// SYNC: OVERSCROLL_MAX in useSheetGestures.ts must not exceed MIN_RESERVE.
const MIN_RESERVE = 48;
// A finger can pull past the top by at most the viewport's height. The rubber
// band over a sheet as tall as the viewport then shows 35.5% of it.
const RESERVE_VIEWPORT_SHARE = 0.4;

function sheetReserve(viewportHeight: number): number {
  return Math.max(
    MIN_RESERVE,
    Math.ceil(viewportHeight * RESERVE_VIEWPORT_SHARE),
  );
}
const MOBILE_KEYBOARD_BOTTOM_CLEARANCE = 48;
// How many more frames a drag's close looks for its scrim's fade to adopt.
const MAX_SCRIM_FADE_ADOPT_FRAMES = 3;
const TRANSITION_BACKSTOP_BUFFER_MS = 50;
// The floating handle bar's height. The bar is out of flow; at rest the
// content box keeps a band this tall under it (`clearsGrabBar`), so the pill
// (4px, centered, 10-14px from the sheet's top edge) never sits on the first
// row, and scrolled content rides up beneath it.
const HANDLE_BAR_HEIGHT = spacingVars['--spacing-6'];

const BLOCK_SIZE_PROPERTIES = [
  'height',
  'minHeight',
  'maxHeight',
  'blockSize',
  'minBlockSize',
  'maxBlockSize',
] as const;

/** Whether StyleX styles hold any style: they can nest in arrays. */
function hasStyles(xstyle: unknown): boolean {
  return Array.isArray(xstyle)
    ? xstyle.some(hasStyles)
    : xstyle != null && typeof xstyle === 'object';
}

function supportsWebAnimations(): boolean {
  return (
    typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function'
  );
}

/**
 * How long a drag's close plays, in ms. It is the close spring's move from
 * where the finger left the sheet, timed as the shared animator times it.
 */
function dragExitMs(element: Element, exit: SheetDragExit): number {
  return resolveSettleMs(element, springs.sheetDismissSwipe, {
    from: 0,
    to: exit.distance,
    velocity: exit.velocity,
    epsilon: SETTLE_THRESHOLD.y,
  });
}

/** The running fade that clears the scrim behind `panel`, if any. */
function clearingScrimFade(panel: Element): Animation | undefined {
  const dialog = panel.closest('dialog');
  const doc = panel.ownerDocument;
  if (dialog == null || typeof doc.getAnimations !== 'function') {
    return undefined;
  }
  const fades = doc.getAnimations().filter(animation => {
    const effect = animation.effect as KeyframeEffect | null;
    return (
      effect?.target === dialog &&
      (animation as CSSTransition).transitionProperty === 'opacity' &&
      // Skip a fade that the drag started. A style update replaces that fade.
      Number(effect.getKeyframes().at(-1)?.opacity) === 0
    );
  });
  const onBackdrop = fades.filter(
    fade => (fade.effect as KeyframeEffect).pseudoElement === '::backdrop',
  );
  // An engine that reports no backdrop effect (WebKit) puts the backdrop's
  // fade on the dialog itself, which runs no opacity transition of its own.
  return (
    onBackdrop.length > 0
      ? onBackdrop
      : fades.filter(fade => !(fade.effect as KeyframeEffect).pseudoElement)
  ).at(-1);
}

// Measure the viewport that the height budgets use. They are `dvh`, which
// the virtual keyboard does not shrink, so `visualViewport` would differ by
// the keyboard's height. `useMobileKeyboard` handles the keyboard and does
// not change the detents.
function layoutViewportHeight(): number {
  return typeof window === 'undefined' ? 0 : window.innerHeight;
}

// The layout viewport's height, as the `resize` listener last read it. While
// the listener runs, a render reads this value, never `innerHeight`. After a
// commit's DOM writes, a read of `innerHeight` forces a style recalculation
// and a layout. Open sheets share one listener. With no sheet open, the value
// is null, because nothing keeps it current.
let viewportHeight: number | null = null;
const viewportHeightListeners = new Set<() => void>();
let stopViewportResize: (() => void) | null = null;

function handleViewportResize(): void {
  viewportHeight = layoutViewportHeight();
  for (const listener of viewportHeightListeners) {
    listener();
  }
}

function subscribeToViewportHeight(onChange: () => void): () => void {
  viewportHeightListeners.add(onChange);
  if (stopViewportResize == null) {
    stopViewportResize = subscribeInput(window, 'resize', handleViewportResize);
    // A resize between the first render and this listener has no event left
    // to deliver. So read the height now, and let React compare it with the
    // height it rendered.
    viewportHeight = layoutViewportHeight();
    onChange();
  }
  return () => {
    viewportHeightListeners.delete(onChange);
    if (viewportHeightListeners.size === 0) {
      stopViewportResize?.();
      stopViewportResize = null;
      viewportHeight = null;
    }
  };
}

function readViewportHeight(): number {
  // Without a listener, nothing keeps a stored height current.
  if (stopViewportResize == null) {
    return layoutViewportHeight();
  }
  viewportHeight ??= layoutViewportHeight();
  return viewportHeight;
}

function readNoViewportHeight(): number {
  return 0;
}

function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * A stable identity for a set of snap points. Type-tagged, so the fraction
 * `0.5` and the (invalid) string `'0.5'` cannot collide on one key.
 *
 * Recomputed every render — the panel re-renders on every frame of a drag — so
 * it stays a single pass over a handful of values, and everything derived from
 * the points hangs off it instead of being rebuilt per frame.
 */
function snapPointsKeyFor(
  points: ReadonlyArray<BottomSheetSnapPoint> | undefined,
): string {
  let key = '';
  for (const point of points ?? []) {
    key += `${typeof point}:${point}|`;
  }
  return key;
}

// An explicit padding publishes only the part past the grab bar's band, so a
// lone Section that escapes the published padding still starts below the bar.
// `clearsGrabBar` applies the band on top.
const pastGrabBarStyles = stylex.create({
  0: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-0']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  0.5: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-0-5']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  1: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-1']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  1.5: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-1-5']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  2: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-2']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  3: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-3']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  4: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-4']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  5: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-5']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  6: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-6']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  8: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-8']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
  10: {
    '--container-padding-block-start': `max(calc(${spacingVars['--spacing-10']} - ${HANDLE_BAR_HEIGHT}), 0px)`,
  },
});

/**
 * The reduced-motion queries. With a coarse primary pointer the sheet
 * cross-fades, else it changes at once. The cross-fade lasts at most 200 ms.
 */
const REDUCED_MOTION_COARSE =
  '@media (prefers-reduced-motion: reduce) and (pointer: coarse)';
export const REDUCED_MOTION_COARSE_QUERY =
  '(prefers-reduced-motion: reduce) and (pointer: coarse)';
const CROSS_FADE_MS = 200;

const styles = stylex.create({
  sheet: {
    pointerEvents: 'auto',
    boxSizing: 'border-box',
    // Containing block for the floating handle bar, which is lifted out of
    // flow so the scrolling body reaches the sheet's top edge.
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    width: '100%',
    maxWidth: 640,
    backgroundColor: colorVars['--color-background-surface'],
    // A hairline on the three edges that face the scrim. In dark mode the
    // surface and the scrim are only a few RGB steps apart, and the shadow is
    // black on near-black, so the side edges disappear. The block-end edge
    // stays bare, below the viewport.
    borderBlockStartWidth: borderVars['--border-width'],
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
    borderInlineStartWidth: borderVars['--border-width'],
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    borderInlineEndWidth: borderVars['--border-width'],
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
    borderStartStartRadius: radiusVars['--radius-container'],
    borderStartEndRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-high'],
    outline: 'none',
    overflow: 'hidden',
    paddingBlockEnd: `calc(env(safe-area-inset-bottom, 0px) + var(--_sheet-reserve, ${MIN_RESERVE}px))`,
    marginBlockEnd: `calc(-1 * var(--_sheet-reserve, ${MIN_RESERVE}px))`,
    // Under reduced motion no transform runs. On a coarse primary pointer the
    // entrance is an opacity cross-fade of at most 200 ms. A fine pointer gets
    // the change at once (the 0.01s collapse).
    transform: {
      default: 'translateY(0)',
      '@starting-style': {
        default: 'translateY(100%)',
        '@media (prefers-reduced-motion: reduce)': 'translateY(0)',
      },
    },
    opacity: {
      default: 1,
      '@starting-style': {
        default: 1,
        [REDUCED_MOTION_COARSE]: 0,
      },
    },
    transitionProperty: 'transform, opacity',
    transitionDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce)': {
        default: '0.01s',
        '@media (pointer: coarse)': `0.01s, ${CROSS_FADE_MS}ms`,
      },
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    willChange: 'transform, opacity',
    // The dialog writes its scrim's opacity on itself for each move of a drag,
    // and only its backdrop reads it. A custom property inherits, so each
    // write would restyle every element in the sheet. The panel ends the
    // inheritance, so the restyle stops here.
    '--_sheet-scrim-opacity': 'initial',
    '--_sheet-scrim-duration': 'initial',
  },
  // A sheet present on page load opens where it rests (spec:AST-013 FR13):
  // the collapse reduced motion uses, so the transition still ends.
  sheetSettled: {
    transitionDuration: '0.01s',
  },
  /**
   * The exit is its own motion, not the entrance played backwards. The
   * decelerate `--ease-standard` put the sheet half off-screen in 59ms of a
   * 410ms close, so the travel ended before the eye followed it. An exit
   * accelerates instead (`--ease-exit`). The curve is gentle, so the sheet
   * moves within ~50ms and the close reads as one departure. The duration is
   * the entrance's band, because a shorter band leaves too little travel when
   * a theme scales motion down.
   */
  sheetClosing: {
    // Under reduced motion the exit does not travel. On a coarse pointer it
    // fades out where it is, and on a fine one it ends at once.
    transform: {
      default: 'translateY(100%)',
      '@media (prefers-reduced-motion: reduce)': 'translateY(0)',
    },
    opacity: {
      default: null,
      [REDUCED_MOTION_COARSE]: 0,
    },
    // A pointer presentation closes on the theme's exit curve. A touch
    // presentation keeps its own curve.
    transitionTimingFunction: {
      default: easeVars['--ease-exit'],
      '@media (pointer: coarse)': 'cubic-bezier(0.3, 0, 0.6, 0.6)',
    },
  },
  /**
   * An exit that cross-fades on a pointer that the media query does not
   * cover: a touch swipe dismissal under reduced motion fades out in place on
   * every pointer. It uses the opacity and ceiling of the coarse-pointer rule.
   */
  sheetClosingCrossFade: {
    transform: 'translateY(0)',
    opacity: 0,
    transitionDuration: `0.01s, ${CROSS_FADE_MS}ms`,
  },
  sheetFading: {
    opacity: 0,
  },
  sheetInactive: {
    pointerEvents: 'none',
  },
  handleBar: {
    // Floats over the body rather than taking a row in the flex column. The
    // content starts at the sheet's top edge and rides up under the pill --
    // both moving it closer to the top and letting scrolled content pass
    // beneath instead of stopping at a hard edge.
    position: 'absolute',
    insetBlockStart: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: HANDLE_BAR_HEIGHT,
    // Keeps the pill legible over whatever sits or scrolls under it: opaque
    // surface behind the pill itself, fading out across the lower half so the
    // content emerging below has no visible cut line.
    backgroundImage: `linear-gradient(to bottom, ${colorVars['--color-background-surface']} 60%, transparent)`,
    // WebKit can draw this bar under the scrolling body's own layer while the
    // sheet's transform animates, so the pill vanishes until the sheet rests.
    // A layer of its own keeps it above the body.
    willChange: 'transform',
    // Drags are the handle's; a pinch still zooms the page (WCAG 1.4.4).
    touchAction: 'pinch-zoom',
    cursor: {
      default: 'grab',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // The pill is drawn on the grab bar itself, as decoration with no role.
    '::before': {
      content: '""',
      width: sizeVars['--size-element-lg'],
      height: spacingVars['--spacing-1'],
      borderRadius: radiusVars['--radius-full'],
      backgroundColor: colorVars['--color-border'],
    },
  },
  body: {
    flexGrow: 1,
    minHeight: 0,
    boxSizing: 'border-box',
    touchAction: 'pan-y pinch-zoom',
    outlineOffset: {
      default: 0,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
    // The scrolling area paints the surface itself, covering the sheet's whole
    // inner box. Without it the sheet's edge is not uniform: a theme that packs
    // an inset ring into --shadow-high (the bundled themes all add one in dark
    // mode) draws that ring just inside the sheet, where an opaque content
    // wrapper such as Section paints over it -- so the ring shows only in the
    // gap below where the content ends, and the sheet's side edges appear to
    // change width partway down. Painting the surface here hides the ring
    // evenly, leaving the border below as the sheet's one edge.
    backgroundColor: colorVars['--color-background-surface'],
    // No reserve for the handle bar here: it floats over the scrolling area,
    // so scrolled content rides up under the pill. The content box keeps the
    // resting content clear of the bar instead (`clearsGrabBar`).
    paddingBlockEnd: 0,
  },
  clearsGrabBar: {
    paddingBlockStart: `calc(var(--container-padding-block-start, 0px) + ${HANDLE_BAR_HEIGHT})`,
  },
  content: {
    // Preserve the body's block formatting (including margin/float isolation)
    // and its definite percentage-height basis. fit-content lets this real
    // observed box grow with async content beyond a fixed-height viewport.
    // This box is also the sheet's container: it carries the padding and
    // publishes it, so a lone Section child escapes it exactly as in Dialog.
    // At the block start it publishes only the padding past the grab bar's
    // band, so a child escapes the padding but never the band.
    display: 'flow-root',
    boxSizing: 'border-box',
    height: '100%',
    // fit-content, not min-content: they are one size in the block axis, but
    // WebKit ignores min-content on a block's min-height. There the box keeps
    // its body's height on a budget-height sheet. Content placed directly in
    // it then overflows the box, and its block-end padding leaves the scroll
    // range.
    minHeight: 'fit-content',
  },
  tallKeyboardBody: {
    scrollPaddingBlockEnd: MOBILE_KEYBOARD_BOTTOM_CLEARANCE,
  },
  // The inset the keyboard takes at the end of a Tall sheet's content
  // (useMobileKeyboard), so its last control can scroll above the keyboard.
  // It is the content box's last in-flow box, after the content's own
  // children, not a box after the content. Firefox resolves the content's
  // `min-height: min-content` as `auto` in the block axis. The content box
  // then keeps the body's height while its children overflow it. An inset
  // after that box sat inside the overflow and added no scroll range. In
  // Firefox for Android, the body's scrollHeight was 1491 with and without a
  // 357 px inset.
  tallKeyboardContent: {
    '::after': {
      content: '""',
      display: 'block',
      blockSize: 0,
      pointerEvents: 'none',
    },
  },
  keyboardInset: (inset: number) => ({
    '::after': {
      blockSize: inset,
    },
  }),
  budget: {
    height: `calc(var(--_sheet-budget) + var(--_sheet-reserve, ${MIN_RESERVE}px))`,
  },
  hugHeight: {
    height: 'fit-content',
    maxHeight: `calc(${HEIGHT_BUDGETS.hug} + var(--_sheet-reserve, ${MIN_RESERVE}px))`,
  },
});

export type BottomSheetPanelMotion =
  'entering' | 'aligning' | 'fading' | 'exiting';

export type BottomSheetPanelState =
  | {kind: 'hidden'}
  | {kind: 'open'; entering: boolean}
  | {
      kind: 'retained';
      motion: 'covered' | 'aligning' | 'fading';
      alignmentOffset: number;
    }
  | {kind: 'exiting'};

interface BottomSheetPanelProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the visual sheet panel. */
  ref?: React.Ref<HTMLDivElement>;
  state: BottomSheetPanelState;
  /**
   * Whether the sheet was open on page load: it then opens where it rests,
   * with no entry motion.
   */
  isEntrySettled?: boolean;
  /**
   * Called when the settled entry's transition ends, so the host can release
   * it and later motion in the same open (a drag's settle) animates as usual.
   */
  onEntrySettled?: () => void;
  /**
   * The host's controlled open state — false as soon as the host has taken
   * a close, true while it is open or has refused one — distinct from
   * `state`, which stays `open` until the close settles. Decides whether a
   * swipe release's dismissal was honored (the reduced-motion cross-fade).
   */
  isOpenRequested?: boolean;
  height: BottomSheetHeight | number | string;
  /** Existing host name, reused for the keyboard scrolling group. */
  label: string;
  children: ReactNode;
  /**
   * Content padding on the spacing scale. Omitted, the content box reads the
   * theme's bottom-sheet padding, then --spacing-4 (Dialog's default).
   */
  padding?: SpacingStep;
  snapPoints?: ReadonlyArray<BottomSheetSnapPoint>;
  isSwipeDismissAllowed?: boolean;
  /** Whether the host has locked page scrolling (a modal, scrim-backed sheet). */
  isPageScrollLocked?: boolean;
  onDismiss: () => void;
  onScrimOpacity: (opacity: number) => void;
  /**
   * The scrim's fade under a touch drag's close, in milliseconds, or null
   * once that close ends or a reopen takes the sheet back. `panel` is the
   * sheet's element: the commit that starts the close can detach the host's
   * dialog ref while this runs.
   */
  onScrimFadeDuration?: (panel: HTMLElement, ms: number | null) => void;
  onElementChange?: (element: HTMLDivElement | null) => void;
  /**
   * A ref for the grab handle's element. The handle stays mounted with the
   * panel and carries no other ref.
   */
  handleRef?: Ref<HTMLDivElement>;
  onMotionStart?: (motion: BottomSheetPanelMotion) => void;
  onMotionComplete?: (motion: BottomSheetPanelMotion) => void;
}

/**
 * A hidden sheet observes nothing. The scroll area's measuring ref attaches
 * as the sheet presents and detaches when it is hidden, so a closed sheet
 * that stays mounted holds no resize, mutation or viewport observers.
 */
function whilePresented<P extends {ref?: unknown}>(
  isPresented: boolean,
  props: P,
): P {
  return isPresented ? props : {...props, ref: undefined};
}

function motionForState(
  state: BottomSheetPanelState,
): BottomSheetPanelMotion | null {
  if (state.kind === 'open') {
    return state.entering ? 'entering' : null;
  }
  if (state.kind === 'retained') {
    return state.motion === 'covered' ? null : state.motion;
  }
  return state.kind === 'exiting' ? 'exiting' : null;
}

function waitForTransition(
  element: HTMLElement | null,
  propertyName: 'transform' | 'opacity',
  complete: () => void,
): () => void {
  if (element == null) {
    complete();
    return () => {};
  }

  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backstopMs = 0;
  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    if (timer != null) {
      clearTimeout(timer);
    }
    element.removeEventListener('transitionend', handleTransitionEnd);
    element.removeEventListener('transitioncancel', handleTransitionEnd);
    complete();
  };
  const handleTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== element || event.propertyName !== propertyName) {
      return;
    }
    // The engine cancels a transition whose end value changes mid-flight. A
    // percentage transform does when the closing frame moves the height by a
    // fraction of a pixel. A replacement runs on from where it was. That one
    // ends the motion, not the cancel.
    if (
      event.type === 'transitioncancel' &&
      hasRunningTransition(element, propertyName)
    ) {
      if (timer != null) {
        clearTimeout(timer);
        timer = setTimeout(finish, backstopMs);
      }
      return;
    }
    finish();
  };
  element.addEventListener('transitionend', handleTransitionEnd);
  element.addEventListener('transitioncancel', handleTransitionEnd);

  const computedStyle = getComputedStyle(element);
  if (
    element.style.transition.trim() === 'none' ||
    computedStyle.transition.trim() === 'none'
  ) {
    finish();
    return () => {};
  }
  const properties = computedStyle.transitionProperty
    .split(',')
    .map(value => value.trim());
  const durations = computedStyle.transitionDuration
    .split(',')
    .map(parseTransitionTime);
  const delays = computedStyle.transitionDelay
    .split(',')
    .map(parseTransitionTime);
  let hasUnresolvedTiming = false;
  const transitionMs = properties.reduce((longest, property, index) => {
    if (property !== propertyName && property !== 'all') {
      return longest;
    }
    const duration = durations[index % durations.length];
    const delay = delays[index % delays.length];
    if (duration == null || delay == null) {
      hasUnresolvedTiming = true;
      return longest;
    }
    return Math.max(longest, duration + delay);
  }, 0);

  if (hasUnresolvedTiming) {
    // JSDOM can leave CSS variables unresolved. In that case the native event
    // remains authoritative; choosing a fixed timeout here would make an
    // assumption about the consumer's theme.
    return () => {
      element.removeEventListener('transitionend', handleTransitionEnd);
      element.removeEventListener('transitioncancel', handleTransitionEnd);
    };
  }

  if (transitionMs <= 0) {
    finish();
    return () => {};
  }

  backstopMs = transitionMs + TRANSITION_BACKSTOP_BUFFER_MS;
  timer = setTimeout(finish, backstopMs);
  return () => {
    if (timer != null) {
      clearTimeout(timer);
    }
    element.removeEventListener('transitionend', handleTransitionEnd);
    element.removeEventListener('transitioncancel', handleTransitionEnd);
  };
}

// Whether a CSS transition of `propertyName` still runs on `element`.
function hasRunningTransition(
  element: HTMLElement,
  propertyName: string,
): boolean {
  return (element.getAnimations?.() ?? []).some(
    animation =>
      (animation as Animation & {transitionProperty?: string})
        .transitionProperty === propertyName &&
      (animation.playState === 'running' || animation.playState === 'paused'),
  );
}

function parseTransitionTime(value: string): number | null {
  const normalizedValue = value.trim();
  if (!/^-?(?:\d+|\d*\.\d+)(?:ms|s)$/.test(normalizedValue)) {
    return null;
  }
  const time = Number.parseFloat(value);
  return normalizedValue.endsWith('ms') ? time : time * 1000;
}

/** Internal visual and gesture surface shared by every BottomSheet host. */
export function BottomSheetPanel({
  ref,
  state,
  isOpenRequested,
  height,
  label,
  children,
  padding,
  snapPoints,
  className,
  style,
  tabIndex,
  xstyle,
  isEntrySettled = false,
  onEntrySettled,
  onTransitionEnd,
  isSwipeDismissAllowed = true,
  isPageScrollLocked = false,
  onDismiss,
  onScrimOpacity,
  onScrimFadeDuration,
  onElementChange,
  handleRef,
  onMotionStart,
  onMotionComplete,
  ...props
}: BottomSheetPanelProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const dismissKeyboardRef = useRef<
    ((focusTarget?: HTMLElement) => void) | null
  >(null);
  const onMotionStartRef = useCommittedRef(onMotionStart);
  const onMotionCompleteRef = useCommittedRef(onMotionComplete);
  const onScrimFadeDurationRef = useCommittedRef(onScrimFadeDuration);
  const startedMotionRef = useRef<BottomSheetPanelMotion | null>(null);
  const pendingMotionCompleteRef = useRef<BottomSheetPanelMotion | null>(null);

  const isEntering = state.kind === 'open' && state.entering;
  // This is state, not a ref: a ref written during render keeps the values
  // of a render React discards.
  const [entrance, setEntrance] = useState({
    kind: state.kind,
    isEntering,
    isReactivated: false,
  });
  if (entrance.kind !== state.kind || entrance.isEntering !== isEntering) {
    setEntrance({
      kind: state.kind,
      isEntering,
      isReactivated: isEntering && entrance.kind === 'retained',
    });
  }
  const isReactivatedEntrance = entrance.isReactivated;

  const isInteractive = state.kind === 'open';
  const isPresented = state.kind !== 'hidden';
  const isRetained = state.kind === 'retained';
  const isInactive = isRetained || state.kind === 'exiting';
  const isClosing = state.kind === 'exiting';
  const isFading = isRetained && state.motion === 'fading';
  // Under reduced motion a retained sheet does not align down to a shorter
  // entering sheet, because that is travel. It fades where it is.
  const isReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const alignmentOffset =
    isRetained && !isReducedMotion ? state.alignmentOffset : 0;

  // Everything derived from the snap points keys off their identity, not the
  // array's. The resolver's identity is the hook's signal that the stops
  // changed, so it must not churn on a re-render the drag caused. In state, a
  // render React discards cannot leave its points behind. The resolver
  // resolves them at call time — against whatever the viewport is then, not
  // what it was at memo time.
  const snapPointsKey = snapPointsKeyFor(snapPoints);
  const [keyedSnapPoints, setKeyedSnapPoints] = useState({
    key: snapPointsKey,
    points: snapPoints,
  });
  if (keyedSnapPoints.key !== snapPointsKey) {
    setKeyedSnapPoints({key: snapPointsKey, points: snapPoints});
  }
  const {snapHeights, ignoredSnapPointsMessage} = useMemo(() => {
    const {key, points} = keyedSnapPoints;
    if (key === '') {
      return {snapHeights: undefined, ignoredSnapPointsMessage: ''};
    }
    const ignored = (points ?? []).filter(point => !isValidSnapPoint(point));
    return {
      snapHeights: () =>
        resolveSnapPoints(points ?? [], layoutViewportHeight()),
      ignoredSnapPointsMessage:
        ignored.length === 0
          ? ''
          : `snapPoints ignored ${JSON.stringify(ignored)}. A snap point is a viewport fraction above 0 and up to 1 (0.5 is half the screen), a px length ('320px'), or a percentage ('50%').`,
    };
  }, [keyedSnapPoints]);
  useDevWarning(
    'BottomSheet',
    ignoredSnapPointsMessage,
    ignoredSnapPointsMessage !== '',
  );

  // A caller's height owns the element's height: the drag never writes it.
  const consumerHeight = style?.height;
  // StyleX styles and a class name can size the sheet too. Their rules are
  // only class names here, so any of them counts as a size.
  const isSizedByCaller =
    BLOCK_SIZE_PROPERTIES.some(property => style?.[property] != null) ||
    hasStyles(xstyle) ||
    (className != null && className !== '');
  // Only a finger stretches the sheet past MIN_RESERVE, so a device with no
  // touch pointer keeps the smallest reserve. So does a sheet the caller
  // sizes, which nothing extends by the reserve; the stretch stops at it.
  const hasTouchPointer = useMediaQuery('(any-pointer: coarse)');
  const tracksViewport = isPresented && hasTouchPointer && !isSizedByCaller;
  // Each argument is a module function, so React keeps one snapshot function
  // across renders and does not re-read it in the commit.
  const trackedViewportHeight = useSyncExternalStore(
    tracksViewport ? subscribeToViewportHeight : subscribeToNothing,
    tracksViewport ? readViewportHeight : readNoViewportHeight,
    readNoViewportHeight,
  );
  const reserve =
    trackedViewportHeight > 0
      ? sheetReserve(trackedViewportHeight)
      : MIN_RESERVE;
  const {
    contentProps,
    handleProps,
    bodyProps,
    bodyElementRef,
    sheetRef,
    dragOffset,
    settledOffset,
    isDragging,
    isDismissedByTouchDrag,
    dragExit,
    sheetHeight,
    scrollPreservationInset,
    settlingLayoutOffset,
    settledLayoutOffset,
    completeScrollAreaSettle,
  } = useSheetGestures({
    isOpen: isInteractive,
    isOpenRequested: isOpenRequested ?? isInteractive,
    canDismiss: isSwipeDismissAllowed,
    offscreenBlockEndInset: reserve,
    onDismiss,
    snapHeights,
    onTravelStart: () => {
      // Focusing the sheet dismisses the keyboard as the sheet starts to move.
      dismissKeyboardRef.current?.(elementRef.current ?? undefined);
    },
    onScrimOpacity,
    hasFixedHeight: consumerHeight != null,
  });

  const {getViewportProps, getContentProps} = useScrollableArea({
    // The previous overflow-y:auto also computed overflow-x:auto. Keep wide
    // content reachable instead of clipping that existing inline scroll path.
    axis: 'both',
    keyboardAccess: {owner: 'contentOrViewport', label},
    overscroll: 'contain',
    // The sheet body deliberately remains the boundary for sheet-local sticky
    // content while fitting, as it was before shared scroll adoption.
    stickyContainment: 'always',
  });

  // The sheet measures its own height only while it is presented; a hidden
  // sheet that stays mounted observes nothing.
  const isPresentedRef = useRef(isPresented);
  const setElement = useCallback(
    (element: HTMLDivElement | null) => {
      sheetRef(isPresentedRef.current ? element : null);
      elementRef.current = element;
      onElementChange?.(element);
    },
    [onElementChange, sheetRef],
  );
  // The element a drag's exit moved, until the sheet is hidden.
  const dragExitElementRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (isPresentedRef.current === isPresented) {
      return;
    }
    isPresentedRef.current = isPresented;
    sheetRef(isPresented ? elementRef.current : null);
    // A hidden sheet can stay mounted, so the exit's offset goes back to 0.
    const exited = dragExitElementRef.current;
    if (!isPresented && exited != null) {
      dragExitElementRef.current = null;
      animatorFor(exited).set({y: 0});
    }
  }, [isPresented, sheetRef]);
  const keyboard = useMobileKeyboard(elementRef, {
    move: 'ride',
    inset: true,
    offset: MOBILE_KEYBOARD_BOTTOM_CLEARANCE,
    isEnabled: height === 'tall' && isPresented,
    isExpanded: settledOffset === 0,
    isOpen: isInteractive,
    isPageScrollLocked,
  });
  const keyboardInset = keyboard.inset;
  // The drag's own callback dismisses the keyboard as the sheet starts to
  // move. It runs in the gesture, so it reads the newest dismiss.
  dismissKeyboardRef.current = keyboard.dismiss;
  // Keep controller registration attached to one stable host ref. React
  // detaches an old callback ref when a consumer supplies a new identity; if
  // that public ref were merged with setElement, an ordinary parent rerender
  // could be mistaken for the panel unmounting and cancel a sheet handoff.
  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  const motion = motionForState(state);
  // The cross-fade applies on a coarse pointer, and to a transition that a
  // touch drag's release started: a finger's swipe dismissal fades in place on
  // every pointer. A mouse or pen drag is not a touch drag.
  const isCoarseCrossFade = useMediaQuery(REDUCED_MOTION_COARSE_QUERY);
  const isCrossFade =
    isCoarseCrossFade || (isReducedMotion && isDismissedByTouchDrag);
  // Without Web Animations the animator jumps the sheet to its end, so the
  // stylesheet's exit runs.
  const playedDragExit =
    dragExit != null &&
    !isCrossFade &&
    !isReducedMotion &&
    supportsWebAnimations()
      ? dragExit
      : null;
  // Syncs the scrim's fade with a drag's close. It runs as the host takes the
  // close, before the host clears the scrim, so the fade starts on the
  // close's own clock.
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (playedDragExit == null || element == null) {
      return;
    }
    // The host's current callback hears the fade end, as it heard its start.
    const reportFade = (durationMs: number | null) => {
      onScrimFadeDurationRef.current?.(element, durationMs);
    };
    reportFade(dragExitMs(element, playedDragExit));
    return () => {
      reportFade(null);
    };
  }, [onScrimFadeDurationRef, playedDragExit]);
  // Syncs the motion with the panel's CSS transition, or a drag's exit with
  // the shared animator. The motion completes when that one ends.
  useLayoutEffect(() => {
    if (motion == null) {
      return;
    }
    // React can run this effect again for the same motion, for example when
    // a Suspense boundary shows this content again. The passive effect below
    // does not run again then, so the motion it started stays started, and a
    // completion completes at once instead of waiting for that effect.
    if (startedMotionRef.current !== motion) {
      startedMotionRef.current = null;
    }
    pendingMotionCompleteRef.current = null;
    const complete = () => {
      if (startedMotionRef.current === motion) {
        onMotionCompleteRef.current?.(motion);
      } else {
        pendingMotionCompleteRef.current = motion;
      }
    };
    if (motion === 'entering' && isReactivatedEntrance) {
      complete();
      return;
    }
    const element = elementRef.current;
    if (motion === 'exiting' && playedDragExit != null && element != null) {
      dragExitElementRef.current = element;
      const exit = animatorFor(element).animate(
        {y: playedDragExit.distance},
        {
          spring: springs.sheetDismissSwipe,
          velocity: {y: playedDragExit.velocity},
        },
      );
      let isCurrent = true;
      let isFinished = false;
      let frame: number | null = null;
      // The scrim's fade follows the close. Once the close starts, the fade
      // takes its start time, so the two end together. If the fade has no
      // style yet, look for it again on each of the next few frames.
      void exit.started.then(start => {
        const adopt = (framesLeft: number) => {
          frame = null;
          if (!isCurrent) {
            return;
          }
          const fade = clearingScrimFade(element);
          if (fade != null) {
            fade.startTime = start;
          } else if (framesLeft > 0) {
            frame = requestAnimationFrame(() => adopt(framesLeft - 1));
          }
        };
        adopt(MAX_SCRIM_FADE_ADOPT_FRAMES);
      });
      void exit.finished.then(() => {
        isFinished = true;
        onScrimFadeDurationRef.current?.(element, null);
        if (isCurrent) {
          complete();
        }
      });
      return () => {
        isCurrent = false;
        if (frame != null) {
          cancelAnimationFrame(frame);
        }
        // A reopen during the exit takes the sheet back from where it is.
        if (!isFinished) {
          exit.retarget({y: 0});
        }
      };
    }
    // What ends a motion: the fade is opacity, and the entrance, alignment and
    // exit are transforms. Under the reduced-motion cross-fade an exit fades
    // where it is, and its dialog closes only after the fade, so it waits on
    // opacity. The entrance still waits on its instant transform, so the
    // retained sheet's fade starts at once and the two fades cross.
    const crossFadeMotion = isCrossFade && motion === 'exiting';
    return waitForTransition(
      elementRef.current,
      motion === 'fading' || crossFadeMotion ? 'opacity' : 'transform',
      complete,
    );
  }, [
    motion,
    isCrossFade,
    playedDragExit,
    isReactivatedEntrance,
    onMotionCompleteRef,
    onScrimFadeDurationRef,
  ]);
  // The snap is transform-only; the layout height reconciles when it lands.
  // waitForTransition — the same helper the motion states use — resolves that
  // even when no `transitionend` is coming: inline or computed
  // `transition: none`, a zero duration, and a timer backstop otherwise.
  useLayoutEffect(() => {
    if (settlingLayoutOffset == null) {
      return;
    }
    return waitForTransition(
      elementRef.current,
      'transform',
      completeScrollAreaSettle,
    );
  }, [completeScrollAreaSettle, settlingLayoutOffset]);
  useEffect(() => {
    if (motion == null) {
      return;
    }
    onMotionStartRef.current?.(motion);
    startedMotionRef.current = motion;
    if (pendingMotionCompleteRef.current === motion) {
      pendingMotionCompleteRef.current = null;
      onMotionCompleteRef.current?.(motion);
    }
    return () => {
      if (startedMotionRef.current === motion) {
        startedMotionRef.current = null;
      }
      if (pendingMotionCompleteRef.current === motion) {
        pendingMotionCompleteRef.current = null;
      }
    };
  }, [motion, onMotionCompleteRef, onMotionStartRef]);

  // Same lowering as Dialog: with no padding prop the content box reads the
  // theme's --astryx-bottom-sheet-padding chain (--spacing-4 when unset), else
  // the explicit step.
  const usesThemePadding = padding == null;
  const effectivePadding = padding ?? 4;
  const paddingToken = spacingStepToToken[effectivePadding] as SpacingToken;

  const isNamedHeight = typeof height === 'string' && height in HEIGHT_BUDGETS;
  const budget = isNamedHeight
    ? HEIGHT_BUDGETS[height as BottomSheetHeight]
    : typeof height === 'number'
      ? `${height}px`
      : height;
  const hasMeasuredSheet = sheetHeight > 0;
  let gestureTransform = contentProps.style.transform;
  let resizedHeight: string | undefined;
  if (hasMeasuredSheet) {
    // The sheet's travel is split across two properties: `layoutOffset` is the
    // part the scrolling area gives up as layout height, and the remainder is
    // a compositor transform. Live gestures and snaps only ever move the
    // transform — the layout height changes at rest, in one reconciling render
    // whose visible geometry is identical (see useSheetGestures).
    //   - dragging above the base restores the full height below the viewport
    //     (the move that crosses writes that height to the element itself,
    //     so this render only catches up to it)
    //   - a peek settles with layout 0, so it slides rather than reflowing
    const layoutOffset = isDragging
      ? dragOffset < settledOffset
        ? 0
        : settledLayoutOffset
      : (settlingLayoutOffset ?? settledLayoutOffset);
    const activeOffset = isDragging ? dragOffset : settledOffset;
    const translation = activeOffset - layoutOffset;

    // At layout 0 the sheet is its natural height, so leave that to CSS —
    // `hug` sheets must stay fit-content. While the sheet is in motion it is
    // pinned in px instead: content reflowing mid-gesture would move the
    // surface out from under the finger, or under the snap.
    const isTraveling = isDragging || settlingLayoutOffset != null;
    resizedHeight =
      layoutOffset > 0 || isTraveling
        ? sheetLayoutHeight(sheetHeight, layoutOffset)
        : undefined;
    gestureTransform =
      translation !== 0 ? `translateY(${translation}px)` : undefined;
  }
  const retainedTransform =
    alignmentOffset > 0
      ? [gestureTransform, `translateY(${alignmentOffset}px)`]
          .filter(Boolean)
          .join(' ')
      : gestureTransform;
  const sheetTransform = isInteractive
    ? gestureTransform
    : isRetained
      ? retainedTransform
      : undefined;
  const consumerTransform = style?.transform;
  const hostHeight =
    isInteractive || isRetained || isClosing ? resizedHeight : undefined;
  const bodyEndPadding = scrollPreservationPadding(scrollPreservationInset);
  // The transform is written to the element here, not through the style
  // prop. A drag writes it straight to the element and renders nothing, so
  // React never sees those writes. Through the prop, React would skip the
  // resting value as unchanged, and the sheet would stay where the finger
  // left it. Written after each commit outside a drag, the resting value
  // lands with the restored transition, so a settle animates from the live
  // position.
  //
  // A drag that crosses its base detent also writes the height and the end
  // inset. If the release runs before that move's render commits, React sees
  // no change and writes nothing, so these are written here too. A caller's
  // height stays in the style prop, because the drag does not write it.
  useLayoutEffect(() => {
    if (isDragging) {
      return;
    }
    const element = elementRef.current;
    if (element != null) {
      // A drag's close holds the sheet where the finger left it, so the exit
      // starts from there. A step back to rest first would turn the sheet
      // the wrong way. A reduced-motion close fades the sheet out there. A
      // hidden sheet keeps no drag offset, so it opens again from rest.
      const holdsDragClose =
        isPresented &&
        dragExit != null &&
        (!isClosing || playedDragExit != null || isCrossFade);
      if (consumerTransform == null && !holdsDragClose) {
        element.style.transform = sheetTransform ?? '';
      }
      if (consumerHeight == null) {
        element.style.height = hostHeight ?? '';
      }
    }
    const body = bodyElementRef.current;
    if (body != null) {
      body.style.paddingBlockEnd = bodyEndPadding ?? '';
    }
  });
  const gestureStyle = {
    transition: contentProps.style.transition,
    touchAction: contentProps.style.touchAction,
    overscrollBehavior: contentProps.style.overscrollBehavior,
    height: hostHeight,
  };
  return (
    <div
      {...props}
      ref={setElement}
      tabIndex={tabIndex ?? -1}
      onTransitionEnd={event => {
        onTransitionEnd?.(event);
        if (isEntrySettled && event.target === event.currentTarget) {
          onEntrySettled?.();
        }
      }}
      {...mergeProps(
        themeProps('bottom-sheet'),
        stylex.props(
          layerTextReset.reset,
          layerStructureReset.reset,
          styles.sheet,
          overlayPaddingReset.reset,
          height === 'hug' ? styles.hugHeight : styles.budget,
          isClosing && styles.sheetClosing,
          isClosing && isCrossFade && styles.sheetClosingCrossFade,
          isFading && styles.sheetFading,
          isInactive && styles.sheetInactive,
          isEntrySettled && styles.sheetSettled,
          xstyle,
        ),
        className,
        {
          ['--_sheet-budget' as string]: budget,
          ['--_sheet-reserve' as string]: `${reserve}px`,
          ...(isInteractive
            ? gestureStyle
            : isRetained || isClosing
              ? {height: hostHeight}
              : {}),
          ...style,
        },
      )}>
      <div
        ref={handleRef}
        {...stylex.props(styles.handleBar)}
        {...handleProps}
        aria-hidden="true"
      />
      <div
        {...whilePresented(
          isPresented,
          getViewportProps<HTMLDivElement>({
            ...bodyProps,
            ...mergeProps(
              stylex.props(
                focusOutlineStyles.focusVisible,
                styles.body,
                height === 'tall' && styles.tallKeyboardBody,
              ),
              bodyEndPadding != null
                ? {style: {paddingBlockEnd: bodyEndPadding}}
                : {},
            ),
          }),
        )}>
        <div
          {...whilePresented(
            isPresented,
            getContentProps<HTMLDivElement>(
              stylex.props(
                styles.content,
                height === 'tall' && styles.tallKeyboardContent,
                height === 'tall' &&
                  keyboardInset > 0 &&
                  styles.keyboardInset(keyboardInset),
                ...container(
                  usesThemePadding
                    ? {useThemeDefault: 'bottom-sheet'}
                    : {
                        paddingInnerX: paddingToken,
                        paddingInnerY: paddingToken,
                        paddingOuterX: paddingToken,
                        paddingOuterY: paddingToken,
                      },
                ),
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  paddingStyles[effectivePadding],
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingInlineVarStyles[effectivePadding],
                // An explicit padding publishes what reaches past the grab
                // bar's band, like the theme default (Layout/container.stylex.ts).
                !usesThemePadding && pastGrabBarStyles[effectivePadding],
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingBlockEndVarStyles[effectivePadding],
                // The band under the grab bar, on top of the published
                // padding past it: max(padding, the bar) in all.
                styles.clearsGrabBar,
              ),
            ),
          )}>
          <LayerContentBoundary>{children}</LayerContentBoundary>
        </div>
      </div>
    </div>
  );
}

BottomSheetPanel.displayName = 'BottomSheetPanel';
