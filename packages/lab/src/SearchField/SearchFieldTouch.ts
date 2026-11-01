// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SearchFieldTouch.ts
 * @input The animator and the search table (Core's internal entry
 *   `@astryxdesign/core/internal/motion`), the touch resolver and the tap
 *   recognizer (`@astryxdesign/core/internal/touch`), searchFieldModel.ts and
 *   lab's keyboard listener (keyboard/useKeyboardHeight.ts)
 * @output useSearchFieldMotion: SearchField's touch layer. It places the
 *   field's parts and, under a finger, plays UIKit's activation and cancel
 *   (stacked: one clock; bottom: the measured gel) from the frame that
 *   presents them at rest, a change of mind adding to the curves on screen.
 *   A bottom field keeps above the software keyboard by layout, committed
 *   on each keyboard report with no ride. Where the keyboard covers the
 *   page, a tap on the text of a bottom or tab field is claimed, so Safari
 *   does not pan the page. Under a mouse or a trackpad the parts take their
 *   places at once
 * @position SearchField's one touch-layer module, imported only by
 *   SearchField.tsx, so a desktop build can swap it and the size report can
 *   measure it
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
  isClickGuardArmed,
  isRtlElement,
  TapGestureRecognizer,
  useGestureRecognizer,
  useTouchPresentation,
} from '@astryxdesign/core/internal/touch';
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
import type {
  AnimateOptions,
  Animator,
  MotionCurve,
  MotionHandle,
} from '@astryxdesign/core/internal/motion';
import {useAnimator} from '../internal/useAnimator';
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
 * is the animator's: under a finger it turns the travel into a cross-fade
 * (`design:reduced-motion` DR2).
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
  const rootAnimator = useAnimator();
  // The rounded ends and the middle are pseudo-elements (decoration:
  // architecture:component-style-authoring INV7): the field's ::before and
  // ::after, and the trailing part's ::before.
  const startAnimator = useAnimator({pseudoElement: '::before'});
  const contentAnimator = useAnimator();
  const middleAnimator = useAnimator({pseudoElement: '::after'});
  const endAnimator = useAnimator();
  const endCapAnimator = useAnimator({pseudoElement: '::before'});
  const closeAnimator = useAnimator();
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

  // The state the parts last settled toward (null before the first
  // layout), and whether a move is still playing.
  const settledRef = useRef<boolean | null>(null);
  const isAnimating = useRef(false);
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
    let cancelled = false;
    const shape = geometry();
    const to = poseFor(target, shape);
    const current = presented();
    // UIKit's clock and curve, the search table's.
    const timing = activationTiming();
    const duration = timing.seconds;
    // From rest the move waits for the frame that presents the parts at rest
    // (`start: 'presented'`): Mobile Safari brings the keyboard up with no
    // frame for ~150 ms after the focus, and a motion created before that
    // stall would jump a third of the way when frames resume. A host that
    // moves with the field (a navigation bar) starts the same way, in the
    // same task, so both start together. A change of mind mid-move adds the
    // turn to the curve on screen (`additive`), as UIKit's animations do: the
    // old curve carries the rest of its travel, the added one runs the whole
    // clock, and the turn keeps its velocity however late WebKit applies it.
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
    void Promise.all(playing.map(handle => handle.finished)).then(results => {
      if (cancelled || !results.every(Boolean)) {
        return;
      }
      isAnimating.current = false;
    });
    return () => {
      cancelled = true;
    };
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
    // iOS changes the field's frame each frame with no animation object:
    // play the measured frames, every part on one clock, from the frame that
    // presents the field at rest (as the stacked field starts). A change of
    // mind mid-move adds an eased turn from where the field shows to the
    // curves on screen, on the activation's whole clock, as UIKit's
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
    let cancelled = false;
    const playing = handles.filter(
      (handle): handle is MotionHandle => handle != null,
    );
    void Promise.all(playing.map(handle => handle.finished)).then(results => {
      if (cancelled || !results.every(Boolean)) {
        return;
      }
      isAnimating.current = false;
    });
    return () => {
      cancelled = true;
    };
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
  // (SearchField.tsx) takes the lift at once on each report: a Lab surface
  // commits the resting value and never rides the keyboard (spec:AST-099
  // FR8, react-component-runtime INV11), under reduced motion too.
  const isLifted = isBottom && isTouch;
  const keyboardHeight = useKeyboardHeight(isLifted, inputRef);
  // How far the field's resting centre sits above the viewport's bottom
  // edge, read once per keyboard change: where layout puts the field
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

  // A tap on the text of a field at the bottom of the screen (`bottom`,
  // `tab`) focuses it without Safari's reveal (`preventScroll`): Safari would
  // otherwise pan the whole page up to show a field the keyboard is about to
  // cover (spec:AST-099 FR4). The tap is the gesture system's: recognizing it
  // cancels the browser's own focus for that touch. Taps on the buttons, and
  // taps once the text has focus, stay the browser's. Only where the
  // keyboard covers the page (Mobile Safari, FR2): where the browser reports
  // the keyboard itself (Chrome on Android, FR8), only its own tap brings
  // the keyboard up (a focus from script inside the tap does not, measured
  // on the Android emulator), and as the keyboard overlays the page from
  // the focus on, that focus pans nothing, so the tap stays the browser's.
  // The recognizer attaches only where it claims (react-component-runtime
  // INV5): any other field keeps the browser's own touch-action and tap.
  // It takes a finger and a pen, which Safari reveals a field for alike
  // (spec:AST-094 FR43); a mouse press stays the browser's, which places the
  // caret and selects text where it lands (DEC-21). The claim is touch work:
  // it attaches only where the primary pointer is coarse, so under a fine one
  // (desktop Safari or Firefox, where no software keyboard rises) a mouse or
  // a pen tablet keeps the browser's own focus and click (spec:AST-017
  // FR59).
  const [claimsTap, setClaimsTap] = useState(false);
  useLayoutEffect(() => {
    const win = rootAnimator.animator.element?.ownerDocument.defaultView;
    setClaimsTap(
      !isStacked && isTouch && win != null && keyboardCoversPage(win),
    );
  }, [isStacked, isTouch, rootAnimator]);
  const noClaimTarget = useRef<HTMLElement | null>(null);
  // A tap held a while still gets its mouse events a few ms after its
  // cancelled touchend, aimed at whatever is under the finger by then (the
  // field has moved): the claimed tap swallows them, from its touchend until
  // that click, the next touch, pointer or key, or unmount. A click with no
  // press behind it (`detail` 0, from a key) passes. Where the gesture host
  // armed its click guard at the claimed lift (utils/clickGuard.ts), the
  // guard takes that click first, on the window's capture phase, so this
  // swallow never sees it: once the guard has let go (its click, the next
  // press, or its window), the late events are over and this one lets go too.
  const disarmRef = useRef<(() => void) | null>(null);
  const armSwallow = useCallback((doc: Document) => {
    disarmRef.current?.();
    let sawGuard = false;
    const swallow = (event: Event) => {
      if (event.type === 'click' && (event as MouseEvent).detail === 0) {
        return;
      }
      if (isClickGuardArmed(doc)) {
        sawGuard = true;
      } else if (sawGuard) {
        disarm();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'click') {
        disarm();
      }
    };
    const types = ['mousedown', 'mouseup', 'click'] as const;
    const ends = ['touchstart', 'pointerdown', 'keydown'] as const;
    const disarm = () => {
      for (const type of types) {
        doc.removeEventListener(type, swallow, true);
      }
      for (const type of ends) {
        doc.removeEventListener(type, disarm, true);
      }
      if (disarmRef.current === disarm) {
        disarmRef.current = null;
      }
    };
    for (const type of types) {
      doc.addEventListener(type, swallow, true);
    }
    for (const type of ends) {
      doc.addEventListener(type, disarm, true);
    }
    disarmRef.current = disarm;
  }, []);
  useEffect(() => () => disarmRef.current?.(), []);
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
      armSwallow(input.ownerDocument);
      input.focus({preventScroll: true});
      // The browser would have put the caret where the finger lifted; the
      // claimed tap cancels its focus, and script focus leaves the caret at
      // the start or where it last was, so place it from the tap.
      const offset = caretOffsetAt(input, tap.location().x);
      if (offset != null) {
        input.setSelectionRange(offset, offset);
      }
    },
  );

  // Focus navigation into the field (the keyboard's previous and next
  // buttons, Tab) moves focus from another control, and the browser reveals
  // the field in its own focus step. That move's blur, dispatched in the
  // capture phase ahead of the step, names the field in `relatedTarget`:
  // focusing it there with preventScroll leaves the step nothing to reveal
  // (spec:AST-099 FR4), the rule core's keyboard module follows to refuse a
  // reveal (#8176). A host's own focus goes through the handle, which passes
  // preventScroll. Where the tap is claimed.
  useEffect(() => {
    const input = inputRef.current;
    const doc = input?.ownerDocument;
    if (!claimsTap || input == null || doc == null) {
      return;
    }
    const onBlur = (event: FocusEvent) => {
      if (event.relatedTarget === input && doc.activeElement !== input) {
        input.focus({preventScroll: true});
      }
    };
    doc.addEventListener('blur', onBlur, true);
    return () => doc.removeEventListener('blur', onBlur, true);
  }, [claimsTap, inputRef]);

  // A resize while settled (the window turning, a host relaying out) moves
  // the narrowed end to the new width at once.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const Observer = field?.ownerDocument.defaultView?.ResizeObserver;
    // The tab bar lays out and moves a tab field's box; it has no parts.
    if (field == null || Observer == null || placement === 'tab') {
      return;
    }
    const observer = new Observer(() => {
      if (isAnimating.current || settledRef.current === null) {
        return;
      }
      if (isBottom) {
        placeBottom(bottomPoseFor(settledRef.current, bottomShape().width));
      } else {
        place(poseFor(settledRef.current, geometry()));
      }
    });
    observer.observe(field);
    return () => observer.disconnect();
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

/** A curve times a constant (a direction). */
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
 * (`set`), which also ends whatever that property was still playing (a
 * cancel's held opacity that a re-activation keeps at 1 would otherwise drop
 * to 0 when the cancel's clock ends); an animation with no visible change
 * would also run on the main thread in Chromium.
 */
function play(
  animator: Animator,
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
