// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTabBarSearch.ts
 * @input The capsule, the search field's host, and the search tab's state.
 *   Lab's keyboard measurement (../keyboard/useKeyboardHeight.ts), Core's
 *   animator and press tracker (internal/touch), uikitTabBar.ts and
 *   tabBarModel.ts.
 * @output useTabBarSearch: the search tab's motion (UIKit's `UISearchTab`),
 *   its refs, and the active field's place above the keyboard
 * @position Part of TabBar's touch layer (TabBarTouch.ts)
 *
 * SYNC: When modified, update TabBar.tsx, tabBarModel.ts and
 * __tests__/TabBar.interaction.browser.spec.ts.
 */

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {isRtlElement, usePressTracker} from '@astryxdesign/core/internal/touch';
import {useKeyboardHeight} from '../keyboard/useKeyboardHeight';
import {searchCancelShift, searchFieldBox, searchLift} from './tabBarModel';
import {useMotionAnimator} from '../internal/useMotionAnimator';
import {tabBar} from './uikitTabBar';

/** The field and its button in their places in the bar. */
const REST = {lift: 0, shift: 0};

export interface UseTabBarSearchOptions {
  readonly capsuleRef: RefObject<HTMLDivElement | null>;
  /**
   * The element holding the field: focus inside it brings up the software
   * keyboard, which the active field sits above.
   */
  readonly hostRef: RefObject<HTMLElement | null>;
  /** The search tab is selected. */
  readonly isSearching: boolean;
  /** The search field is active (widened to span the screen). */
  readonly isActive: boolean;
  /**
   * A finger drives the bar: only then does the field move (on UIKit's
   * springs); under a mouse it shows at once.
   */
  readonly isTouch: boolean;
  /**
   * When the search circle's glass may grow back to its bar size (ms, the
   * document timeline). Set as Cancel's release wobble starts. So the wobble
   * plays at the minimized size, as UIKit's does (TabBar passes it to the
   * minimize, which grows the glass).
   */
  readonly glassHoldRef: RefObject<number>;
}

export interface TabBarSearch {
  /**
   * The search circle: hidden while the search tab is selected and its
   * field waits inline; under a finger, the active field's cancel button.
   */
  readonly circle: (element: HTMLElement | null) => void;
  /** The circle's search glyph. */
  readonly searchGlyph: (element: HTMLElement | null) => void;
  /** The circle's cancel glyph, while the field is active under a finger. */
  readonly cancelGlyph: (element: HTMLElement | null) => void;
  /** The Cancel button over the circle: the press's target. */
  readonly cancel: (element: HTMLElement | null) => void;
  /** The field's glass and content: fades in, moves between its places. */
  readonly field: (element: HTMLElement | null) => void;
  /** The field glass's middle: its width. */
  readonly fieldMiddle: (element: HTMLElement | null) => void;
  /** The field glass's trailing cap: its width. */
  readonly fieldEnd: (element: HTMLElement | null) => void;
  /**
   * Under a finger, where the active field and its cancel button sit. Their
   * lift above their places in the bar (px, negative is up) and the cancel
   * button's move toward the screen's trailing edge (px). Each keyboard report
   * changes them once.
   */
  readonly place: {readonly lift: number; readonly shift: number};
}

/**
 * WHAT MOVES (uikitTabBar.ts, measured on iOS 26.2)
 *
 * Selecting the search tab collapses the bar to its leading circle, which is
 * useTabBarMinimize.ts's morph. The search field shows inline in the bar's row,
 * `searchFieldGap` after the circle, and the search circle fades. The field is
 * always mounted, so a tap can focus it at once. Active, the field's glass
 * moves and widens to span the screen but for the cancel button
 * (`searchActive`, `searchMorph`). It squashes as it starts
 * (`searchSquashVelocity`), its box changed in CSS and its start carried over.
 * The search circle, shrunk to the minimized size, is the field's cancel
 * button: its cancel glyph appears at `searchCancelDelay`, moved
 * `searchCancelShift` toward the screen's edge. Pressed, it grows to
 * `searchCancelPressedSize` on `searchCancelPress`. Released, it shrinks back
 * with UIKit's wobble on `searchCancelReturn`. Core's press tracker reads the
 * press (UIControl's highlight), only while it is the cancel button under a
 * finger. Under Reduce Motion it does not scale. Field and button sit
 * `searchKeyboardGap` above the software keyboard. Lab's measurement reports
 * the keyboard's height from the visual viewport, and each report is committed
 * once, as an offset, with no ride. Cancelling keeps that place until the
 * keyboard is reported down, also when the cancel returns to the tab search was
 * chosen from. Deactivating plays the morph back; leaving the search tab fades
 * the field out and the circle back in. These moves run on UIKit's springs,
 * under a finger only. Under a mouse the search tab selects in place and the
 * field shows at once (TabBar.tsx).
 */
export function useTabBarSearch({
  capsuleRef,
  hostRef,
  isSearching,
  isActive,
  isTouch,
  glassHoldRef,
}: UseTabBarSearchOptions): TabBarSearch {
  const circle = useMotionAnimator();
  const searchGlyph = useMotionAnimator();
  const cancelGlyph = useMotionAnimator({initial: {opacity: 0}});
  const field = useMotionAnimator({initial: {opacity: 0}});
  const fieldMiddle = useMotionAnimator();
  const fieldEnd = useMotionAnimator();

  // The circle shows unless the search tab waits inline (selected, its field
  // not active). Active, it is the field's cancel button, which appears at
  // UIKit's delay. Selecting the search tab (or leaving it) fades the field in
  // (or out).
  const isCancel = isSearching && isActive;
  const isCircleShown = !isSearching || isCancel;
  const wasShownRef = useRef(isCircleShown);
  const wasSearchingRef = useRef(isSearching);
  useLayoutEffect(() => {
    const wasShown = wasShownRef.current;
    const wasSearching = wasSearchingRef.current;
    wasShownRef.current = isCircleShown;
    wasSearchingRef.current = isSearching;
    const fade = {spring: tabBar.minimizeFade};
    if (wasShown !== isCircleShown) {
      circle.animator.animate(
        {opacity: isCircleShown ? 1 : 0},
        fade,
        isCancel
          ? {at: performance.now() + tabBar.searchCancelDelay * 1000}
          : undefined,
      );
    }
    if (wasSearching !== isSearching) {
      // Leaving, the field stays visible while it settles back into the bar.
      field.animator.animate(
        {opacity: isSearching ? 1 : 0},
        isSearching ? fade : {spring: tabBar.collapseSize},
      );
    }
  }, [isCircleShown, isCancel, isSearching, circle, field]);

  // The circle's glyph: the cancel glyph from UIKit's delay while it is the
  // cancel button, the search glyph otherwise.
  const wasCancelRef = useRef(isCancel);
  useLayoutEffect(() => {
    if (wasCancelRef.current === isCancel) {
      return;
    }
    wasCancelRef.current = isCancel;
    const swap = {spring: tabBar.minimizeFade};
    const options = isCancel
      ? {at: performance.now() + tabBar.searchCancelDelay * 1000}
      : undefined;
    cancelGlyph.animator.animate({opacity: isCancel ? 1 : 0}, swap, options);
    searchGlyph.animator.animate({opacity: isCancel ? 0 : 1}, swap, options);
  }, [isCancel, cancelGlyph, searchGlyph]);

  // The Cancel button's press: UIControl's highlight from core's press tracker
  // on the button, attached only while it shows. The circle under it draws the
  // press: pressed, it grows to `searchCancelPressedSize`. Released, it shrinks
  // back with UIKit's wobble, at the minimized size (the glass grows back to
  // its bar size only once the wobble rests). Under Reduce Motion a press
  // scales nothing.
  // The Cancel button mounts only while `isCancel` holds, so its ref is
  // the tracker's target.
  const pressTargetRef = useRef<HTMLElement | null>(null);
  const cancelRef = useCallback((element: HTMLElement | null) => {
    pressTargetRef.current = element;
  }, []);
  // Whether the circle shows the press. A search ending under the press (Escape
  // in the field, say) takes the tracker's target with no release. So the
  // circle's return then plays from the effect below.
  const isPressedRef = useRef(false);
  const playPress = (isPressed: boolean) => {
    isPressedRef.current = isPressed;
    const options = {touchRelease: !isPressed};
    if (circle.animator.reducedMotion(options) !== 'off') {
      return;
    }
    const now = performance.now();
    const velocity = circle.animator.getVelocity('scale', now);
    const handle = circle.animator.animate(
      {
        scale: isPressed
          ? tabBar.searchCancelPressedSize / tabBar.minimizedSize
          : 1,
      },
      {
        spring: isPressed
          ? tabBar.searchCancelPress
          : tabBar.searchCancelReturn,
        velocity: {scale: velocity},
      },
      options,
    );
    if (!isPressed) {
      const wobble = handle.curve('scale');
      glassHoldRef.current = now + (wobble?.duration ?? 0) * 1000;
    }
  };
  usePressTracker(pressTargetRef, {onHighlightChange: playPress});
  const playPressRef = useRef(playPress);
  playPressRef.current = playPress;
  useLayoutEffect(() => {
    if (!isCancel && isPressedRef.current) {
      playPressRef.current(false);
    }
  }, [isCancel]);

  // Where the active field and its cancel button sit. Above the keyboard as of
  // its last report, read once per report and committed as an offset (no ride).
  // After a cancel the place holds until the keyboard is reported down. So
  // nothing jumps while it goes, also when the cancel returns to the tab search
  // was chosen from, as the docs advise. Measured only from the field's
  // activation until the keyboard is reported down after it (one listener,
  // while needed). The hold is adjusted during render: set while the field is
  // active, cleared once the keyboard is reported down after it.
  const isFieldActive = isSearching && isActive;
  const [isHeld, setIsHeld] = useState(false);
  const keyboardHeight = useKeyboardHeight(isFieldActive || isHeld, hostRef);
  if (isFieldActive && !isHeld) {
    setIsHeld(true);
  } else if (!isFieldActive && isHeld && keyboardHeight <= 0) {
    setIsHeld(false);
  }
  const [place, setPlace] = useState(REST);
  const placeRef = useRef(place);
  placeRef.current = place;
  useLayoutEffect(() => {
    const host = hostRef.current;
    const capsule = capsuleRef.current;
    const isRaised = isFieldActive || (isHeld && keyboardHeight > 0);
    if (!isRaised || host == null || capsule == null) {
      setPlace(REST);
      return;
    }
    const win = host.ownerDocument.defaultView;
    if (win == null) {
      return;
    }
    // Where layout puts the field without its lift.
    const bottom = host.getBoundingClientRect().bottom - placeRef.current.lift;
    const lift = searchLift(win.innerHeight, keyboardHeight, bottom);
    const shift = isActive
      ? (isRtlElement(capsule) ? -1 : 1) * searchCancelShift()
      : 0;
    setPlace(previous =>
      previous.lift === lift && previous.shift === shift
        ? previous
        : {lift, shift},
    );
  }, [isFieldActive, isHeld, isActive, keyboardHeight, hostRef, capsuleRef]);

  // Activating (or not): the field's box changed in CSS this frame; its
  // glass starts where it was and springs to rest, squashing as it starts.
  const wasActiveRef = useRef(isActive);
  useLayoutEffect(() => {
    const was = wasActiveRef.current;
    wasActiveRef.current = isActive;
    const element = capsuleRef.current;
    if (!isTouch || was === isActive || element == null) {
      return;
    }
    const bar = element.parentElement ?? element;
    const isRtl = isRtlElement(element);
    const sign = isRtl ? -1 : 1;
    const from = searchFieldBox(bar.offsetWidth, was);
    const to = searchFieldBox(bar.offsetWidth, isActive);
    const now = performance.now();
    const cap = tabBar.accessoryHeight;
    field.animator.set({
      x: field.animator.get('x', now) + sign * (from.start - to.start),
    });
    fieldEnd.animator.set({
      x: fieldEnd.animator.get('x', now) + sign * (from.width - to.width),
    });
    fieldMiddle.animator.set({
      scaleX:
        (fieldMiddle.animator.get('scaleX', now) * (from.width - cap)) /
        (to.width - cap),
    });
    const morph = {spring: tabBar.searchMorph};
    field.animator.animate({x: 0}, morph);
    // The width's squash: its trailing cap and middle start moving inward.
    const squash = isActive ? tabBar.searchSquashVelocity : 0;
    fieldEnd.animator.animate({x: 0}, {...morph, velocity: {x: sign * squash}});
    fieldMiddle.animator.animate(
      {scaleX: 1},
      {...morph, velocity: {scaleX: squash / (to.width - cap)}},
    );
  }, [isActive, isTouch, capsuleRef, field, fieldEnd, fieldMiddle]);

  return {
    circle: circle.ref,
    searchGlyph: searchGlyph.ref,
    cancelGlyph: cancelGlyph.ref,
    cancel: cancelRef,
    field: field.ref,
    fieldMiddle: fieldMiddle.ref,
    fieldEnd: fieldEnd.ref,
    place,
  };
}
