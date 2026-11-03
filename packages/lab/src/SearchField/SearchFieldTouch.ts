// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SearchFieldTouch.ts
 * @input Core's internal touch entry, the search table, searchFieldModel.ts
 *   and Lab's keyboard listener
 * @output useSearchFieldMotion, SearchField's touch layer: the parts' places,
 *   UIKit's activation and cancel under a finger, the bottom field's keyboard
 *   lift, and the claimed tap
 * @position Only SearchField.tsx imports it, so a desktop build can swap it
 *   and the size report can measure it.
 *
 * SYNC: When modified, update SearchField.tsx and searchFieldModel.ts.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  claimFocusMoves,
  isRtlElement,
  TapGestureRecognizer,
  useGestureRecognizer,
  useTouchPresentation,
  type AnimateOptions,
  type MotionAnimator,
  type MotionCurve,
  type MotionHandle,
} from '@astryxdesign/core/internal/touch';
import {observeResize} from '@astryxdesign/core';
import {
  activationTiming,
  bottomEdges,
  bottomLift,
  bottomMotion,
  bottomPoseFor,
  bottomRedirect,
  easedCurve,
  heldCurve,
  poseFor,
  type BottomMotion,
  type BottomPose,
  type SearchFieldGeometry,
  type SearchFieldPose,
} from './searchFieldModel';
import {useMotionAnimator} from '../internal/useMotionAnimator';
import {search} from '../internal/searchMotion';
import {
  keyboardCoversPage,
  useKeyboardHeight,
} from '../keyboard/useKeyboardHeight';

const {bottom} = search;

/** Where the field lives (SearchField's `placement`). */
export type SearchFieldPlacement = 'stacked' | 'bottom' | 'tab';

/** The refs SearchField puts on the parts the touch layer moves. */
export interface SearchFieldMotion {
  rootRef: (element: HTMLElement | null) => void;
  /**
   * The field box: the touch layer moves its ::before, the leading end
   * (under a bottom field's gel).
   */
  startRef: (element: HTMLElement | null) => void;
  contentRef: (element: HTMLElement | null) => void;
  /** The field box: the touch layer scales its ::after, the middle. */
  middleRef: (element: HTMLElement | null) => void;
  endRef: (element: HTMLElement | null) => void;
  /**
   * The trailing part: the touch layer scales its ::before, the trailing
   * end's cap (under a bottom field's gel).
   */
  endCapRef: (element: HTMLElement | null) => void;
  closeRef: (element: HTMLElement | null) => void;
  /**
   * How far a bottom field sits above its resting place for the software
   * keyboard, px: layout, applied as the root's `bottom`. 0 elsewhere.
   */
  keyboardLift: number;
}

/**
 * SearchField's touch layer: the parts' poses, and UIKit's activation under
 * a finger (a coarse primary pointer, on every touch device). Reduced motion
 * is the animator's: under a finger it turns the travel into a cross-fade.
 */
export function useSearchFieldMotion({
  fieldRef,
  inputRef,
  isActive,
  lift,
  placement,
}: {
  fieldRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  isActive: boolean;
  lift: number;
  placement: SearchFieldPlacement;
}): SearchFieldMotion {
  const rootAnimator = useMotionAnimator();
  // The rounded ends and the middle are pseudo-elements, being decoration:
  // the field's ::before and ::after, and the trailing part's ::before.
  const startAnimator = useMotionAnimator({pseudoElement: '::before'});
  const contentAnimator = useMotionAnimator();
  const middleAnimator = useMotionAnimator({pseudoElement: '::after'});
  const endAnimator = useMotionAnimator();
  const endCapAnimator = useMotionAnimator({pseudoElement: '::before'});
  const closeAnimator = useMotionAnimator();
  const {isTouch} = useTouchPresentation();
  const isBottom = placement === 'bottom';
  const isStacked = placement === 'stacked';

  // ---------------------------------------------------------------------------
  // Stacked: UIKit's activation on one clock
  // ---------------------------------------------------------------------------

  const fieldHeight = isBottom
    ? bottom.fieldHeight
    : search.stacked.fieldHeight;
  const geometry = useCallback((): SearchFieldGeometry => {
    const field = fieldRef.current;
    return {
      restWidth: field?.getBoundingClientRect().width ?? 0,
      height: fieldHeight,
      lift,
      isRtl: isRtlElement(field),
    };
  }, [fieldRef, fieldHeight, lift]);

  const presented = useCallback(
    (): SearchFieldPose => ({
      y: rootAnimator.animator.get('y'),
      middleScale: middleAnimator.animator.get('scaleX'),
      endX: endAnimator.animator.get('x'),
      closeX: closeAnimator.animator.get('x'),
      closeOpacity: closeAnimator.animator.get('opacity'),
    }),
    [rootAnimator, middleAnimator, endAnimator, closeAnimator],
  );

  const place = useCallback(
    (pose: SearchFieldPose) => {
      rootAnimator.animator.set({y: pose.y});
      middleAnimator.animator.set({scaleX: pose.middleScale});
      endAnimator.animator.set({x: pose.endX});
      closeAnimator.animator.set({x: pose.closeX, opacity: pose.closeOpacity});
    },
    [rootAnimator, middleAnimator, endAnimator, closeAnimator],
  );

  // `settledRef` is null until the first layout places the parts.
  const settledRef = useRef<boolean | null>(null);
  const isAnimating = useRef(false);
  const latestMove = useRef(0);
  // Syncs the parts' compositor animations (the animator) with `isActive`.
  useLayoutEffect(() => {
    if (!isStacked) {
      return;
    }
    const target = isActive;
    if (settledRef.current === null || !isTouch) {
      // First layout, or a mouse or trackpad: take the places at once.
      settledRef.current = target;
      place(poseFor(target, geometry()));
      // The parts now hold their places: the CSS form of the active pose
      // (for a server render) steps aside in the same task.
      rootAnimator.animator.element?.setAttribute(
        'data-search-field-placed',
        '',
      );
      return;
    }
    if (settledRef.current === target && !isAnimating.current) {
      place(poseFor(target, geometry()));
      return;
    }
    settledRef.current = target;
    const continuesMotion = isAnimating.current;
    isAnimating.current = true;
    const move = ++latestMove.current;
    const shape = geometry();
    const to = poseFor(target, shape);
    const current = presented();
    // UIKit's clock and curve, the search table's.
    const timing = activationTiming();
    const duration = timing.seconds;
    // From rest the move waits for the frame that presents the parts at rest
    // (`start: 'presented'`). Mobile Safari shows no frame for ~150 ms after
    // the focus, while the keyboard comes up. A motion made before that stall
    // would jump a third of the way when frames resume. A host that moves
    // with the field, like a navigation bar, starts the same way in the same
    // task, so both start together. A change of mind mid-move adds the turn
    // to the curve on screen (`additive`), as UIKit's animations do. The old
    // curve carries the rest of its travel, and the added one runs the whole
    // clock. So the turn keeps its velocity however late WebKit applies it.
    // Under reduced motion the animator plays its cross-fade for these.
    const options = continuesMotion
      ? {additive: true}
      : {start: 'presented' as const};
    const handles = [
      play(
        rootAnimator.animator,
        {y: easedCurve(current.y, to.y, duration, timing.ease)},
        options,
      ),
      play(
        middleAnimator.animator,
        {
          scaleX: easedCurve(
            current.middleScale,
            to.middleScale,
            duration,
            timing.ease,
          ),
        },
        options,
      ),
      play(
        endAnimator.animator,
        {x: easedCurve(current.endX, to.endX, duration, timing.ease)},
        options,
      ),
      play(
        closeAnimator.animator,
        {
          x: easedCurve(current.closeX, to.closeX, duration, timing.ease),
          // Cancel slides the close button out at the opacity it has and
          // removes it at the end, as UIKit does.
          opacity: target
            ? easedCurve(
                current.closeOpacity,
                to.closeOpacity,
                duration,
                timing.ease,
              )
            : heldCurve(current.closeOpacity, to.closeOpacity, duration),
        },
        options,
      ),
    ];
    const playing = handles.filter(
      (handle): handle is MotionHandle => handle != null,
    );
    // When the latest move ends, finished or stopped, the next move starts
    // from rest.
    void Promise.all(playing.map(handle => handle.finished)).then(() => {
      if (latestMove.current === move) {
        isAnimating.current = false;
      }
    });
    // `geometry` changes with `lift`; a lift change while settled re-places
    // the field through the same path.
  }, [
    isStacked,
    isActive,
    isTouch,
    geometry,
    place,
    presented,
    rootAnimator,
    middleAnimator,
    endAnimator,
    closeAnimator,
  ]);

  // ---------------------------------------------------------------------------
  // Bottom: the measured gel
  // ---------------------------------------------------------------------------

  const bottomShape = useCallback(() => {
    const root = rootAnimator.animator.element;
    return {width: root?.clientWidth ?? 0, isRtl: isRtlElement(root)};
  }, [rootAnimator]);

  const placeBottom = useCallback(
    (pose: BottomPose) => {
      const {width, isRtl} = bottomShape();
      const parts = bottomParts(pose, width, isRtl, fieldHeight);
      const direction = isRtl ? -1 : 1;
      startAnimator.animator.set({x: parts.shift, scaleY: parts.heightScale});
      contentAnimator.animator.set({x: parts.shift});
      middleAnimator.animator.set({
        x: parts.shift,
        scaleX: parts.middleScale,
        scaleY: parts.heightScale,
      });
      endAnimator.animator.set({x: parts.endX});
      endCapAnimator.animator.set({scaleY: parts.heightScale});
      closeAnimator.animator.set({
        x: direction * pose.closeX,
        scale: pose.closeScale,
        opacity: pose.closeOpacity,
      });
    },
    [
      bottomShape,
      fieldHeight,
      startAnimator,
      contentAnimator,
      middleAnimator,
      endAnimator,
      endCapAnimator,
      closeAnimator,
    ],
  );

  // Where the bottom field shows now, read off its parts.
  const presentedBottom = useCallback((): BottomPose => {
    const {width, isRtl} = bottomShape();
    const edges = bottomEdges(width);
    const direction = isRtl ? -1 : 1;
    return {
      leading: edges.restLeading + direction * startAnimator.animator.get('x'),
      trailing: edges.restTrailing + direction * endAnimator.animator.get('x'),
      heightScale: endCapAnimator.animator.get('scaleY'),
      closeX: direction * closeAnimator.animator.get('x'),
      closeScale: closeAnimator.animator.get('scale'),
      closeOpacity: closeAnimator.animator.get('opacity'),
    };
  }, [bottomShape, startAnimator, endAnimator, endCapAnimator, closeAnimator]);

  // Syncs the bottom field's compositor animations (the animator) with
  // `isActive`.
  useLayoutEffect(() => {
    if (!isBottom) {
      return;
    }
    const target = isActive;
    const {width, isRtl} = bottomShape();
    if (settledRef.current === null || !isTouch) {
      // First layout, or a mouse or trackpad: take the places at once.
      settledRef.current = target;
      placeBottom(bottomPoseFor(target, width));
      return;
    }
    if (settledRef.current === target && !isAnimating.current) {
      placeBottom(bottomPoseFor(target, width));
      return;
    }
    settledRef.current = target;
    // iOS changes the field's frame each frame with no animation object. So
    // play the measured frames, every part on one clock. Start from the frame
    // that presents the field at rest, as the stacked field does. A change of
    // mind mid-move adds an eased turn to the curves on screen. It starts
    // where the field shows and runs the activation's whole clock, as UIKit's
    // animations do.
    const continuesMotion = isAnimating.current;
    const motion = continuesMotion
      ? (() => {
          const timing = activationTiming();
          return bottomRedirect(
            presentedBottom(),
            target,
            width,
            timing.seconds,
            timing.ease,
          );
        })()
      : bottomMotion(target, width);
    const direction = isRtl ? -1 : 1;
    const part = (pick: (parts: BottomParts) => number) =>
      derivedCurve(motion, pick, width, isRtl, fieldHeight);
    const options = continuesMotion
      ? {additive: true}
      : {start: 'presented' as const};
    isAnimating.current = true;
    const move = ++latestMove.current;
    const handles = [
      play(
        startAnimator.animator,
        {x: part(p => p.shift), scaleY: part(p => p.heightScale)},
        options,
      ),
      play(contentAnimator.animator, {x: part(p => p.shift)}, options),
      play(
        middleAnimator.animator,
        {
          x: part(p => p.shift),
          scaleX: part(p => p.middleScale),
          scaleY: part(p => p.heightScale),
        },
        options,
      ),
      play(endAnimator.animator, {x: part(p => p.endX)}, options),
      play(
        endCapAnimator.animator,
        {scaleY: part(p => p.heightScale)},
        options,
      ),
      play(
        closeAnimator.animator,
        {
          x: scaled(motion.closeX, direction),
          scale: motion.closeScale,
          opacity: motion.closeOpacity,
        },
        options,
      ),
    ];
    const playing = handles.filter(
      (handle): handle is MotionHandle => handle != null,
    );
    // When the latest move ends, finished or stopped, the next move starts
    // from rest.
    void Promise.all(playing.map(handle => handle.finished)).then(() => {
      if (latestMove.current === move) {
        isAnimating.current = false;
      }
    });
  }, [
    isBottom,
    isActive,
    isTouch,
    bottomShape,
    placeBottom,
    presentedBottom,
    fieldHeight,
    rootAnimator,
    startAnimator,
    contentAnimator,
    middleAnimator,
    endAnimator,
    endCapAnimator,
    closeAnimator,
  ]);

  // ---------------------------------------------------------------------------
  // Bottom: above the software keyboard
  // ---------------------------------------------------------------------------

  // The keyboard's height as of its last report (lab's one keyboard
  // listener, keyboard/useKeyboardHeight.ts). The root's `bottom`
  // (SearchField.tsx) takes the lift at once on each report. A Lab surface
  // commits the resting value and never rides the keyboard, even under
  // reduced motion.
  const isLifted = isBottom && isTouch;
  const keyboardHeight = useKeyboardHeight(isLifted, inputRef);
  // How far the field's resting centre sits above the viewport's bottom
  // edge, read once per keyboard change. It is where layout puts the field
  // without the lift (the root's `bottom`).
  const [restGap, setRestGap] = useState(0);
  useLayoutEffect(() => {
    const root = rootAnimator.animator.element;
    const win = root?.ownerDocument.defaultView;
    if (!isLifted || root == null || win == null) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const lift = parseFloat(win.getComputedStyle(root).bottom) || 0;
    setRestGap(win.innerHeight - (rect.top + lift + rect.height / 2));
  }, [isLifted, keyboardHeight, rootAnimator]);
  const keyboardLift = isLifted
    ? bottomLift(isActive, keyboardHeight, restGap)
    : 0;

  // ---------------------------------------------------------------------------
  // Bottom and tab: a claimed tap on the text
  // ---------------------------------------------------------------------------

  // A tap on the text focuses the field with preventScroll. The browser's
  // own focus would pan the page under the keyboard. The claim attaches only
  // under a coarse pointer where the keyboard covers the page. It takes touch
  // and pen. A mouse keeps the browser's focus and caret. `isTouch` is false
  // on the server and while hydrating, so no markup differs.
  const claimsTap =
    !isStacked &&
    isTouch &&
    typeof window !== 'undefined' &&
    keyboardCoversPage(window);
  const noClaimTarget = useRef<HTMLElement | null>(null);
  useGestureRecognizer(
    claimsTap ? fieldRef : noClaimTarget,
    () =>
      new TapGestureRecognizer({
        name: 'search-field-bottom-focus',
        allowedPointerTypes: ['touch', 'pen'],
        shouldReceiveTouch: (_recognizer, touch) => {
          const input = inputRef.current;
          const target = touch.target as Element | null;
          return (
            input != null &&
            input.ownerDocument.activeElement !== input &&
            !(target?.closest?.('button') != null)
          );
        },
      }),
    tap => {
      const input = inputRef.current;
      if (tap.state !== 'ended' || input == null) {
        return;
      }
      input.focus({preventScroll: true});
      // The browser would have put the caret where the finger lifted. The
      // claimed tap cancels that focus, and script focus leaves the caret at
      // the start or where it last was. So place it from the tap.
      const offset = caretOffsetAt(input, tap.location().x);
      if (offset != null) {
        input.setSelectionRange(offset, offset);
      }
    },
  );

  // Focus navigation into the field (the keyboard's previous and next
  // buttons, Tab) moves focus from another control. The browser would then
  // reveal the field by panning the page, so the field claims that move
  // (claimFocusMoves). A host's own focus goes through the handle, which
  // passes preventScroll. This applies only where the tap is claimed.
  useEffect(() => {
    const input = inputRef.current;
    const doc = input?.ownerDocument;
    if (!claimsTap || input == null || doc == null) {
      return;
    }
    // Read at event time: a placement switch remounts the input.
    return claimFocusMoves(doc, event => {
      const field = inputRef.current;
      return field != null && event.relatedTarget === field ? field : null;
    });
  }, [claimsTap, inputRef]);

  // A resize while settled (the window turning, a host relaying out) moves
  // the narrowed end to the new width at once.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    // The tab bar lays out and moves a tab field's box; it has no parts.
    if (field == null || placement === 'tab') {
      return;
    }
    return observeResize(field, () => {
      if (isAnimating.current || settledRef.current === null) {
        return;
      }
      if (isBottom) {
        placeBottom(bottomPoseFor(settledRef.current, bottomShape().width));
      } else {
        place(poseFor(settledRef.current, geometry()));
      }
    });
  }, [
    fieldRef,
    placement,
    isBottom,
    geometry,
    place,
    placeBottom,
    bottomShape,
  ]);

  return {
    rootRef: rootAnimator.ref,
    startRef: startAnimator.ref,
    contentRef: contentAnimator.ref,
    middleRef: middleAnimator.ref,
    endRef: endAnimator.ref,
    endCapRef: endCapAnimator.ref,
    closeRef: closeAnimator.ref,
    keyboardLift,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/** The bottom field's part values for one frame. */
interface BottomParts {
  /** The leading edge's move from rest, px (the start cap, text, middle). */
  shift: number;
  /** The stretchable middle's width as a fraction of its resting width. */
  middleScale: number;
  /** The trailing end's move from rest, px. */
  endX: number;
  /** The background's height as a fraction of its resting height. */
  heightScale: number;
}

function bottomParts(
  pose: Pick<BottomPose, 'leading' | 'trailing' | 'heightScale'>,
  width: number,
  isRtl: boolean,
  height: number,
): BottomParts {
  const edges = bottomEdges(width);
  const direction = isRtl ? -1 : 1;
  const cap = height / 2;
  const restMiddle = Math.max(
    1,
    edges.restTrailing - edges.restLeading - 2 * cap,
  );
  return {
    shift: direction * (pose.leading - edges.restLeading),
    middleScale:
      Math.max(0, pose.trailing - pose.leading - 2 * cap) / restMiddle,
    endX: direction * (pose.trailing - edges.restTrailing),
    heightScale: pose.heightScale,
  };
}

/** A part's curve, read off the field's measured edges each frame. */
function derivedCurve(
  motion: BottomMotion,
  pick: (parts: BottomParts) => number,
  width: number,
  isRtl: boolean,
  height: number,
): MotionCurve {
  const duration = Math.max(
    motion.leading.duration,
    motion.trailing.duration,
    motion.heightScale.duration,
  );
  const at = (t: number) =>
    pick(
      bottomParts(
        {
          leading: motion.leading.at(t),
          trailing: motion.trailing.at(t),
          heightScale: motion.heightScale.at(t),
        },
        width,
        isRtl,
        height,
      ),
    );
  return {duration, at, velocity: t => slope(at, t)};
}

function scaled(curve: MotionCurve, factor: number): MotionCurve {
  return {
    duration: curve.duration,
    at: t => factor * curve.at(t),
    velocity: t => factor * curve.velocity(t),
  };
}

/** A numeric derivative, units/s. */
function slope(at: (t: number) => number, t: number): number {
  const lo = Math.max(0, t - 0.001);
  const hi = t + 0.001;
  return (at(hi) - at(lo)) / (hi - lo);
}

/**
 * The text offset nearest a client x inside a text input: the caret a tap at
 * that x would place. Measures the input's text with its own font, from its
 * content box's start edge and scroll position; null where text cannot be
 * measured.
 */
function caretOffsetAt(
  input: HTMLInputElement,
  clientX: number,
): number | null {
  const doc = input.ownerDocument;
  const style = doc.defaultView?.getComputedStyle(input);
  const context =
    style == null ? null : doc.createElement('canvas').getContext('2d');
  if (style == null || context == null) {
    return null;
  }
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spacing = parseFloat(style.letterSpacing) || 0;
  const rect = input.getBoundingClientRect();
  const isRtl = style.direction === 'rtl';
  const contentStart = isRtl
    ? rect.right -
      (parseFloat(style.borderRightWidth) || 0) -
      (parseFloat(style.paddingRight) || 0)
    : rect.left +
      (parseFloat(style.borderLeftWidth) || 0) +
      (parseFloat(style.paddingLeft) || 0);
  const along =
    (isRtl ? contentStart - clientX : clientX - contentStart) +
    Math.abs(input.scrollLeft);
  const text = input.value;
  let best = 0;
  let bestDistance = Infinity;
  for (let offset = 0; offset <= text.length; offset++) {
    const width =
      context.measureText(text.slice(0, offset)).width + spacing * offset;
    const distance = Math.abs(width - along);
    if (distance < bestDistance) {
      best = offset;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Plays the given curves. A curve that does not move is put in place instead
 * (`set`). That also ends whatever the property was still playing. For
 * example, a re-activation keeps a cancel's held opacity at 1, which would
 * otherwise drop to 0 when the cancel's clock ends. In Chromium, an animation
 * with no visible change would also run on the main thread.
 */
function play(
  animator: MotionAnimator,
  curves: Partial<
    Record<'x' | 'y' | 'scale' | 'scaleX' | 'scaleY' | 'opacity', MotionCurve>
  >,
  options: AnimateOptions,
): MotionHandle | null {
  const moving: typeof curves = {};
  for (const [key, curve] of Object.entries(curves) as [
    keyof typeof curves,
    MotionCurve,
  ][]) {
    const first = curve.at(0);
    // A curve can leave its value and come back (the bottom field's swell),
    // so look along it, not only at its ends.
    const moves = Array.from({length: 33}, (_, i) =>
      curve.at((curve.duration * i) / 32),
    ).some(value => Math.abs(value - first) > 1e-6);
    if (moves) {
      moving[key] = curve;
    } else {
      animator.set({[key]: first});
    }
  }
  if (Object.keys(moving).length === 0) {
    return null;
  }
  return animator.play(moving, options);
}
