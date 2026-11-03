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
 * - /packages/core/src/BottomSheet/useMobileKeyboard.ts
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
  type ReactNode,
} from 'react';
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
  containerPaddingBlockStartVarStyles,
  containerPaddingInlineVarStyles,
  overlayPaddingReset,
  paddingStyles,
  spacingStepToToken,
} from '../Layout/padding.stylex';
import type {SpacingStep} from '../utils/types';
import {
  isValidSnapPoint,
  resolveSnapPoints,
  type BottomSheetSnapPoint,
} from './snapOffsets';
import {useMobileKeyboard} from './useMobileKeyboard';
import {
  scrollPreservationPadding,
  sheetLayoutHeight,
  useSheetGestures,
} from './useSheetGestures';

const HEIGHT_BUDGETS = {
  hug: '92dvh',
  capped: '62dvh',
  tall: '92dvh',
} as const;

export type BottomSheetHeight = keyof typeof HEIGHT_BUDGETS;
export type {BottomSheetSnapPoint};

// SYNC: must match OVERSCROLL_MAX in useSheetGestures.ts.
const OVERSCROLL_PADDING = 48;
const MOBILE_KEYBOARD_BOTTOM_CLEARANCE = 48;
const TRANSITION_BACKSTOP_BUFFER_MS = 50;
// The floating handle bar's height. The bar is out of flow, so this is not
// layout space the content pays for -- the pill (4px, centered) lands 10-14px
// from the sheet's top edge, inside the space a content wrapper's own top
// padding already provides.
const HANDLE_BAR_HEIGHT = spacingVars['--spacing-6'];

// Measure the viewport that the height budgets use. They are `dvh`, which
// the virtual keyboard does not shrink, so `visualViewport` would differ by
// the keyboard's height. `useMobileKeyboard` handles the keyboard and does
// not change the detents.
function layoutViewportHeight(): number {
  return typeof window === 'undefined' ? 0 : window.innerHeight;
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
    paddingBlockEnd: `calc(env(safe-area-inset-bottom, 0px) + ${OVERSCROLL_PADDING}px)`,
    marginBlockEnd: `${-OVERSCROLL_PADDING}px`,
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
    // No reserve for the handle bar: it floats, so the content starts at the
    // sheet's top edge and rides up under the pill. The pill is 4px centered
    // in a 24px band, so it occupies only 10-14px from the edge -- inside the
    // space a content wrapper's own top padding already provides.
    paddingBlockEnd: 0,
  },
  content: {
    // Preserve the body's block formatting (including margin/float isolation)
    // and its definite percentage-height basis. fit-content lets this real
    // observed box grow with async content beyond a fixed-height viewport.
    // This box is also the sheet's container: it carries the padding and
    // publishes it, so a lone Section child escapes it exactly as in Dialog.
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
    '::after': {
      content: '""',
      display: 'block',
      blockSize: 'var(--_sheet-keyboard-inset, 0px)',
      pointerEvents: 'none',
    },
  },
  budget: {
    height: `calc(var(--_sheet-budget) + ${OVERSCROLL_PADDING}px)`,
  },
  hugHeight: {
    height: 'fit-content',
    maxHeight: `calc(${HEIGHT_BUDGETS.hug} + ${OVERSCROLL_PADDING}px)`,
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
  onElementChange?: (element: HTMLDivElement | null) => void;
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
  onElementChange,
  onMotionStart,
  onMotionComplete,
  ...props
}: BottomSheetPanelProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const previousStateRef = useRef(state);
  const reactivatedEntranceRef = useRef(false);
  const onMotionStartRef = useRef(onMotionStart);
  const onMotionCompleteRef = useRef(onMotionComplete);
  const startedMotionRef = useRef<BottomSheetPanelMotion | null>(null);
  const pendingMotionCompleteRef = useRef<BottomSheetPanelMotion | null>(null);

  const isEntering = state.kind === 'open' && state.entering;
  const previousState = previousStateRef.current;
  const wasEntering = previousState.kind === 'open' && previousState.entering;
  if (isEntering && !wasEntering) {
    reactivatedEntranceRef.current = previousState.kind === 'retained';
  } else if (!isEntering) {
    reactivatedEntranceRef.current = false;
  }

  useLayoutEffect(() => {
    previousStateRef.current = state;
    onMotionStartRef.current = onMotionStart;
    onMotionCompleteRef.current = onMotionComplete;
  }, [onMotionComplete, onMotionStart, state]);

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
  // array's: the resolver's identity is the hook's signal that the stops
  // changed, so it must not churn on a re-render the drag caused. The memo
  // reads the points through a ref, so the resolver resolves them at call time
  // — against whatever the viewport is then, not what it was at memo time.
  const snapPointsKey = snapPointsKeyFor(snapPoints);
  const snapPointsRef = useRef(snapPoints);
  snapPointsRef.current = snapPoints;
  const {snapHeights, ignoredSnapPointsMessage} = useMemo(() => {
    if (snapPointsKey === '') {
      return {snapHeights: undefined, ignoredSnapPointsMessage: ''};
    }
    const ignored = (snapPointsRef.current ?? []).filter(
      point => !isValidSnapPoint(point),
    );
    return {
      snapHeights: () =>
        resolveSnapPoints(snapPointsRef.current ?? [], layoutViewportHeight()),
      ignoredSnapPointsMessage:
        ignored.length === 0
          ? ''
          : `snapPoints ignored ${JSON.stringify(ignored)}. A snap point is a viewport fraction above 0 and up to 1 (0.5 is half the screen), a px length ('320px'), or a percentage ('50%').`,
    };
  }, [snapPointsKey]);
  useDevWarning(
    'BottomSheet',
    ignoredSnapPointsMessage,
    ignoredSnapPointsMessage !== '',
  );

  // A caller's height owns the element's height: the drag never writes it.
  const consumerHeight = style?.height;
  const {
    contentProps,
    handleProps,
    bodyProps,
    bodyElementRef,
    sheetRef,
    dragOffset,
    settledOffset,
    isDragging,
    isTraveling,
    isDismissedByTouchDrag,
    sheetHeight,
    scrollPreservationInset,
    settlingLayoutOffset,
    settledLayoutOffset,
    completeScrollAreaSettle,
  } = useSheetGestures({
    isOpen: isInteractive,
    isOpenRequested: isOpenRequested ?? isInteractive,
    canDismiss: isSwipeDismissAllowed,
    offscreenBlockEndInset: OVERSCROLL_PADDING,
    onDismiss,
    snapHeights,
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
  useLayoutEffect(() => {
    if (isPresentedRef.current === isPresented) {
      return;
    }
    isPresentedRef.current = isPresented;
    sheetRef(isPresented ? elementRef.current : null);
  }, [isPresented, sheetRef]);
  useMobileKeyboard({
    bodyRef: bodyElementRef,
    bottomClearance: MOBILE_KEYBOARD_BOTTOM_CLEARANCE,
    isEnabled: height === 'tall',
    isFullyExpanded: settledOffset === 0,
    isPageScrollLocked,
    isSheetTraveling: isTraveling,
    isOpen: isInteractive,
    isPresented,
    sheetRef: elementRef,
  });
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
    if (motion === 'entering' && reactivatedEntranceRef.current) {
      complete();
      return;
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
  }, [motion, isCrossFade]);
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
  }, [motion]);

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
      if (consumerTransform == null) {
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
          ...(isInteractive
            ? gestureStyle
            : isRetained || isClosing
              ? {height: hostHeight}
              : {}),
          ...style,
        },
      )}>
      <div
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
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingBlockStartVarStyles[effectivePadding],
                !usesThemePadding &&
                  effectivePadding !== 4 &&
                  containerPaddingBlockEndVarStyles[effectivePadding],
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
