// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatKeyboard.ts
 * @input React refs, the keyboard module's reports, focus routes and layout
 *   guide, the stream scroll's lock, the motion engine, the touch query and
 *   layout viewport height. Also the input stream's touch ends and scroll ends
 * @output Exports useChatKeyboard: the lift for ChatLayout's dock and message
 *   area, and the refs for its dock, message area and composer region. It
 *   also tells whether a focus call in the composer skips the browser's reveal
 * @position ChatLayout's keyboard behavior (Chat/ChatLayout.tsx); internal
 *
 * The composer sits on the keyboard, as in Messages on iOS. Where the layout
 * guide publishes the keyboard's slide, the dock rides it on the compositor.
 *
 * SYNC: update Chat/ChatLayout.tsx, ChatLayout.doc.mjs and keyboard/README.md
 */

import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {createMotionEngine, type Animator} from '../motion/animator';
import {
  claimTapFocus,
  findTextEntryControl,
  followsDockDeficit,
  getDockRevealVersion,
  getKeyboardHeight,
  getKeyboardPan,
  isDockLeftCovered,
  isTextEntryControl,
  refuseFocusReveal,
  subscribeDockReveal,
  subscribeKeyboardHeight,
  subscribeViewportRest,
} from '../keyboard/keyboardHeight';
import {
  getKeyboardLayoutGuide,
  keyboardProfileOf,
} from '../keyboard/keyboardLayoutGuide';
import {
  deliverTap,
  followsKeyboard,
  watchPans,
} from '../keyboard/keyboardTarget';
import type {KeyboardTransition} from '../keyboard/keyboardModel';
import {rideKeyboard} from '../keyboard/rideKeyboard';
import {layoutViewportHeight} from '../utils/layoutViewport';
import {subscribeInput} from '../utils/inputStream';
import {
  useInteractionModalityTrackingFor,
  type InteractionModality,
} from '../utils/interactionModality';
import {focusForLastInputTemporarily} from '../utils/focusReturn';
import {isCoarsePointer} from '../utils/coarsePointer';
import {useTouchPresentation} from '../utils/touchPresentation';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  isFollowingNewest,
  type UseChatStreamScrollReturn,
} from './useChatStreamScroll';

export interface UseChatKeyboardOptions {
  /** ChatLayout's root. */
  rootRef: RefObject<HTMLElement | null>;
  /** The element that scrolls the transcript (the root, or an outer one). */
  scrollRef: RefObject<HTMLElement | null>;
  /**
   * Whether the root scrolls itself (a sticky dock at its bottom) rather
   * than an outer scroller (a fixed dock at the layout viewport's bottom).
   */
  isSelfScrolling: boolean;
  /**
   * The stream scroll's jump to the newest message (useChatStreamScroll), the
   * owner of the transcript's lock.
   */
  scrollToBottom: UseChatStreamScrollReturn['scrollToBottom'];
}

export interface UseChatKeyboardResult {
  /**
   * The part of the keyboard over the dock, CSS px: the dock's offset from
   * its bottom and the room the message area's end padding adds.
   */
  lift: number;
  /** Callback ref for the dock container. */
  dockRef: (element: HTMLElement | null) => void;
  /** Callback ref for the message area. */
  messagesRef: (element: HTMLElement | null) => void;
  /**
   * Ref for the composer region. Its text taps are claimed, and Done parks
   * focus on it.
   */
  composerRef: RefObject<HTMLDivElement | null>;
  /**
   * Whether a focus call in the composer skips the browser's reveal: false
   * where the browser keeps the composer above the keyboard itself.
   */
  isKeyboardSurface: boolean;
}

// The lift the layout shows: a store the ride's end and keyboard reports
// write, and render reads.
function createLiftStore() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: number) => {
      if (next !== value) {
        value = next;
        for (const listener of listeners) {
          listener();
        }
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

// Controls inside the composer's text (a token's button or link, an island
// that is not editable) keep their own taps, as ChatComposer's click-to-focus
// leaves them.
const OWN_TAPS =
  '[contenteditable="false"], button, a, [role="button"], [data-astryx-token]';

/**
 * The composer's text a touch landed in, when that tap would bring up the
 * keyboard and the text has no focus yet. It is contenteditable text, or a
 * text control passed as the composer's input. The browser would reveal
 * either by scrolling the page. Exported for its tests.
 */
export function editableToClaim(target: unknown): HTMLElement | null {
  let node = target as Node | null;
  if (node != null && node.nodeType !== 1) {
    node = node.parentNode;
  }
  const element = node as Element | null;
  if (element == null || typeof element.closest !== 'function') {
    return null;
  }
  const editable = isTextEntryControl(element)
    ? element
    : element.closest<HTMLElement>(
        '[contenteditable]:not([contenteditable="false"])',
      );
  if (editable == null || !isTextEntryControl(editable)) {
    return null;
  }
  const own = element.closest(OWN_TAPS);
  if (own != null && editable.contains(own)) {
    return null;
  }
  const active = editable.ownerDocument.activeElement;
  return active === editable || editable.contains(active) ? null : editable;
}

/**
 * Done's park: focus rests on the composer region. It is focusable for the
 * park alone, so a click or a tap beside the composer never focuses it. The
 * region gives the focus stop up as soon as focus leaves it. It shows the
 * focus ring only after keyboard input, as other script focus does.
 */
function parkFocus(region: HTMLElement, modality: InteractionModality): void {
  // WebKit ignores `focusVisible: false`, so a park after touch input also
  // hides the ring inline until focus leaves.
  if (modality !== 'keyboard') {
    region.style.setProperty('outline', 'none');
    region.addEventListener(
      'blur',
      () => region.style.removeProperty('outline'),
      {once: true},
    );
  }
  focusForLastInputTemporarily(region, {preventScroll: true}, modality);
}

/**
 * Keeps ChatLayout's composer on top of the software keyboard.
 *
 * @example
 * ```
 * const keyboard = useChatKeyboard({rootRef, scrollRef, isSelfScrolling, scrollToBottom});
 * <div ref={keyboard.messagesRef} {...stylex.props(styles.messages(keyboard.lift))}>…</div>
 * <div ref={keyboard.dockRef} {...stylex.props(styles.dock(keyboard.lift))}>
 *   <div ref={keyboard.composerRef}>…</div>
 * </div>
 * ```
 */
export function useChatKeyboard({
  rootRef,
  scrollRef,
  isSelfScrolling,
  scrollToBottom,
}: UseChatKeyboardOptions): UseChatKeyboardResult {
  const dock = useElementAnimator();
  const messages = useElementAnimator();
  const composerRef = useRef<HTMLDivElement>(null);
  // The lift the layout shows (read in render, so styles carry it) and its
  // mirror for the handlers below.
  const [liftStore] = useState(createLiftStore);
  const lift = useSyncExternalStore(
    liftStore.subscribe,
    liftStore.get,
    liftStore.get,
  );
  const liftRef = useRef(0);
  // What the window's browser does with the fixed dock, from the keyboard
  // module: the effects below follow it.
  const dockRevealVersion = useSyncExternalStore(
    subscribeDockReveal,
    getDockRevealVersion,
    getDockRevealVersion,
  );
  // Set while the guide's ride is under way: the layout waits for it. Each
  // ride's number, so only the latest one hands its translate back.
  const ridingRef = useRef(false);
  const rideRef = useRef(0);
  // Where the last ride took the dock's and the transcript's translates
  // (null: the transcript did not ride), until the layout takes them over.
  const dockTargetRef = useRef<number | null>(null);
  const messagesTargetRef = useRef<number | null>(null);
  // Set while the dock's translate carries a change of the pan's cover that
  // the layout has not taken yet.
  const panPendingRef = useRef(false);
  // Fingers on the screen: while one is down, the reader still moves the pan,
  // however slowly. The input stream's getDownPresses cannot serve. The
  // browser cancels a finger's pointer once its touch starts to scroll, and
  // the stream drops the press then.
  const fingersRef = useRef(0);
  // Whether the transcript followed its newest message, and where it was
  // scrolled, just before the layout's last change.
  const atEndRef = useRef(false);
  const scrollBeforeRef = useRef(0);
  const touchPresentation = useTouchPresentation();
  const readModality = useInteractionModalityTrackingFor(composerRef);

  const isTouch = touchPresentation.isTouch;

  // Synchronizes the layout with the keyboard: it subscribes to the layout
  // guide's transitions for the ride, and takes the height a mount finds.
  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    const win = root?.ownerDocument.defaultView;
    if (root == null || win == null) {
      return undefined;
    }
    // A sticky dock rests at the root's bottom edge, which may sit above or
    // below the layout viewport's; a fixed dock rests at the viewport's.
    // While a keyboard is up the dock rises until it clears the keyboard's
    // cover; without one it rests where the layout puts it. Where the browser
    // keeps the reveal, the keyboard module decides the fixed dock's lift. It
    // is the part of the cover that the browser's pan leaves.
    const leavesReveal = leavesRevealToBrowser(win, scrollRef.current);
    const liftFor = (inset: number) => {
      if (inset <= 0) {
        return 0;
      }
      if (leavesReveal) {
        return followsDockDeficit(win)
          ? Math.max(0, inset - (getKeyboardPan(win) ?? 0))
          : 0;
      }
      // In layout px, as the root's rect is, under a pinch zoom too.
      const viewportBottom = layoutViewportHeight(win);
      const bottom = isSelfScrolling
        ? root.getBoundingClientRect().bottom
        : viewportBottom;
      return Math.max(0, bottom - (viewportBottom - inset));
    };
    // The stream scroll's lock decides whether the transcript follows its
    // newest message, as it does for new content. Its mark changes with the
    // lock, before any render.
    const isAtEnd = () => {
      const scroller = scrollRef.current;
      return scroller != null && isFollowingNewest(scroller);
    };
    // The layout takes the keyboard height's lift once no ride is under way.
    const commit = () => {
      if (ridingRef.current) {
        return;
      }
      const next = liftFor(getKeyboardHeight(win));
      const moves = Math.abs(next - liftRef.current) >= 0.5;
      // The layout takes over the translate a followed pan left.
      if (panPendingRef.current) {
        panPendingRef.current = false;
        dockTargetRef.current = moves ? liftRef.current - next : null;
        if (!moves) {
          dock.animator.set({y: 0});
        }
      }
      if (!moves) {
        return;
      }
      atEndRef.current = isAtEnd();
      scrollBeforeRef.current = scrollRef.current?.scrollTop ?? 0;
      liftStore.set(next);
    };
    // While the dock follows the cover a pan leaves, a report moves only the
    // dock's translate, from the keyboard module's numbers. The layout takes
    // the lift when the last finger lifts. After a fling, it takes it again
    // when the fling comes to rest.
    const followPan = (height: number) => {
      const target = liftRef.current - liftFor(height);
      if (Math.abs(target) < 0.5) {
        if (panPendingRef.current) {
          panPendingRef.current = false;
          dockTargetRef.current = null;
          dock.animator.set({y: 0});
        }
        return;
      }
      panPendingRef.current = true;
      dockTargetRef.current = target;
      dock.animator.set({y: target});
    };

    // The ride plays the curve the guide publishes with each transition: the
    // keyboard's own motion. These are values, not motion roles, since the
    // system moves the keyboard on them whatever the page does.
    const follow = (transition: KeyboardTransition) => {
      // The ride: the dock goes where the guide says the keyboard will be,
      // from the keyboard's start, relative to the layout it rests in now.
      const target = liftRef.current - liftFor(transition.to);
      const atEnd = isAtEnd();
      dockTargetRef.current = target;
      messagesTargetRef.current = atEnd ? target : null;
      if (!transition.animated) {
        rideRef.current += 1;
        ridingRef.current = false;
        dock.animator.set({y: target});
        if (atEnd) {
          messages.animator.set({y: target});
        }
        commit();
        return;
      }
      // Under Reduce Motion the animator's default applies: no travel, a
      // cross-fade on a touch screen.
      const shown = {y: target};
      ridingRef.current = true;
      rideRef.current += 1;
      const ride = rideRef.current;
      // On the keyboard's own motion: Gboard's slide.
      const rides = [
        rideKeyboard(dock.animator, shown, transition)?.finished ??
          Promise.resolve(true),
      ];
      if (atEnd) {
        rides.push(
          rideKeyboard(messages.animator, shown, transition)?.finished ??
            Promise.resolve(true),
        );
      }
      void Promise.all(rides)
        .then(async done => {
          // A newer ride took over: it commits when it ends.
          if (!done.every(Boolean) || ride !== rideRef.current) {
            return;
          }
          // Hand back only once the presented animations are over too. So a
          // paused animation, as an inspector holds, is never left on top of
          // the new layout.
          const element = dock.animator.element;
          await Promise.all(
            (element?.getAnimations?.() ?? []).map(async animation =>
              animation.finished.catch(() => undefined),
            ),
          );
          if (ride === rideRef.current) {
            ridingRef.current = false;
            commit();
          }
        })
        .catch(() => undefined);
    };
    // The ride attaches only under a coarse primary pointer, where the guide
    // publishes the keyboard's own slide: Gboard's, in Chrome on Android.
    // Elsewhere the layout follows the height alone.
    const unsubscribe =
      isTouch && keyboardProfileOf(win) === 'chromium'
        ? getKeyboardLayoutGuide(win).subscribe(follow)
        : undefined;
    // A height change the guide has no ride for, as for a resize or a
    // rotation, takes its lift at once. This listener comes after the guide's,
    // so a ride claims the change first. Where the browser keeps the reveal,
    // a pan changes the lift too.
    let reportedHeight = getKeyboardHeight(win);
    let reportedPan = getKeyboardPan(win);
    const unsubscribeHeight = subscribeKeyboardHeight(win, event => {
      if (event.type !== 'viewport') {
        return;
      }
      const changed = event.height !== reportedHeight;
      const pan = getKeyboardPan(win);
      reportedHeight = event.height;
      // A keyboard hide ends any touch this effect may not have heard end.
      if (event.height <= 0) {
        fingersRef.current = 0;
      }
      const isPanStill = pan === reportedPan;
      reportedPan = pan;
      if (leavesReveal && event.height > 0 && followsDockDeficit(win)) {
        // A report that finds the pan where it was, with no finger down: the
        // pan is at rest.
        if (
          !changed &&
          isPanStill &&
          fingersRef.current === 0 &&
          panPendingRef.current
        ) {
          commit();
        } else {
          followPan(event.height);
        }
      } else if (changed || leavesReveal) {
        commit();
      }
    });
    // A scroll that comes to rest, the visual viewport's included, or a lifted
    // finger hands a followed pan's lift to the layout.
    const rest = () => {
      if (panPendingRef.current) {
        commit();
      }
    };
    const onTouchStart = (event: Event) => {
      fingersRef.current = (event as Partial<TouchEvent>).touches?.length ?? 1;
    };
    const onTouchEnd = (event: Event) => {
      fingersRef.current = (event as Partial<TouchEvent>).touches?.length ?? 0;
      if (fingersRef.current === 0) {
        rest();
      }
    };
    const stopRest = leavesReveal
      ? [
          subscribeInput(win, 'touchstart', onTouchStart),
          subscribeInput(win, 'touchend', onTouchEnd),
          subscribeInput(win, 'touchcancel', onTouchEnd),
          subscribeInput(win, 'scrollend', rest),
          subscribeViewportRest(win, rest),
        ]
      : [];
    // Mounted under a keyboard that is already up: take its place at once.
    commit();
    return () => {
      for (const stop of stopRest) {
        stop();
      }
      unsubscribeHeight();
      unsubscribe?.();
      ridingRef.current = false;
    };
  }, [
    rootRef,
    scrollRef,
    isSelfScrolling,
    isTouch,
    dock.animator,
    messages.animator,
    liftStore,
    dockRevealVersion,
  ]);

  // Synchronizes the dock's and the transcript's translates, and the
  // transcript's scroll, with the lift the layout just took. The translates
  // take the difference, so nothing moves on screen. The newest message stays
  // in view.
  useIsomorphicLayoutEffect(() => {
    const moved = lift - liftRef.current;
    if (Math.abs(moved) < 0.5) {
      return;
    }
    liftRef.current = lift;
    const dockTarget = dockTargetRef.current;
    const messagesTarget = messagesTargetRef.current;
    dockTargetRef.current = null;
    messagesTargetRef.current = null;
    // A ride that ended hands its translate (its target) to the layout; a
    // change no ride covered (a resize) is the layout's alone.
    if (dockTarget != null) {
      dock.animator.set({y: dockTarget + moved});
    }
    const scroller = scrollRef.current;
    if (scroller == null) {
      return;
    }
    // WebKit counts a translated transcript in the scroller's range. So the
    // ride's translate goes before the scroll is set. Otherwise the scroll
    // can stop past the content's end, and the sticky dock rises to meet it.
    if (messagesTarget != null) {
      messages.animator.set({y: 0});
    }
    if (atEndRef.current) {
      scrollToBottom({behavior: 'instant'});
    }
    // The padding's change may have clamped the scroll already: measure from
    // where it was before the layout changed.
    const shifted = scroller.scrollTop - scrollBeforeRef.current;
    if (messagesTarget != null && Math.abs(messagesTarget + shifted) >= 0.5) {
      messages.animator.set({y: messagesTarget + shifted});
    }
  }, [lift, scrollRef, dock.animator, messages.animator, scrollToBottom]);

  // Synchronizes the keyboard module's tap route on the composer with the
  // touch presentation. A tap on the composer's text that would bring up the
  // keyboard takes that route. It focuses here without Safari's reveal,
  // with the caret where the finger lifted, and raises the tap's click once.
  // Under a fine primary pointer no touch listener is registered. Inside an
  // iframe nothing changes.
  useIsomorphicLayoutEffect(() => {
    const composer = composerRef.current;
    const win = composer?.ownerDocument.defaultView ?? null;
    if (
      !touchPresentation.isTouch ||
      composer == null ||
      !followsKeyboard(win) ||
      leavesRevealToBrowser(win, scrollRef.current)
    ) {
      return undefined;
    }
    return claimTapFocus(composer, {
      claim: editableToClaim,
      deliver: deliverTap,
    });
  }, [touchPresentation.isTouch, scrollRef, dockRevealVersion]);

  // A browser that reveals the composer itself pans the visual viewport after
  // the keyboard's report, while the composer still rides up. Chrome 124 on
  // Android pans by the keyboard's whole height. The keyboard module's
  // reveal-pan watch puts the pan back, so the page does not move. With no
  // layout guide, in a page that scrolls the document, the watch also decides
  // at each show whether the browser pans to the dock. It keeps that pan.
  // Synchronizes the keyboard module's reports, under a finger only.
  useIsomorphicLayoutEffect(() => {
    const composer = composerRef.current;
    const win = composer?.ownerDocument.defaultView ?? null;
    if (
      !touchPresentation.isTouch ||
      composer == null ||
      !followsKeyboard(win)
    ) {
      return undefined;
    }
    const pans = watchPans(win, focused => composer.contains(focused), {
      dock: isUnguidedDocument(win, scrollRef.current),
    });
    const unsubscribe = subscribeKeyboardHeight(win, event => {
      if (event.type === 'viewport') {
        pans.report(event.height);
      }
    });
    return () => {
      unsubscribe();
      pans.stop();
    };
  }, [touchPresentation.isTouch, scrollRef]);

  // Synchronizes the keyboard module's focus takeover, and the region's group
  // role, with the touch presentation. Every other move into the composer's
  // text takes it, under a finger only and where the keyboard is measured. A
  // desktop browser keeps its own focus. The pointer is read again on every
  // blur, so a tablet that docks a mouse drops the takeover. When Done ends
  // entry, focus moves to the composer region, a group that is no tab stop.
  // The next tap or Tab then starts from the composer.
  useIsomorphicLayoutEffect(() => {
    const composer = composerRef.current;
    const win = composer?.ownerDocument.defaultView ?? null;
    if (
      !touchPresentation.isTouch ||
      composer == null ||
      !followsKeyboard(win) ||
      leavesRevealToBrowser(win, scrollRef.current)
    ) {
      return undefined;
    }
    // The region is a group only while it is the park's target. It has no
    // accessible name: the layout names none of the caller's regions.
    composer.setAttribute('role', 'group');
    const stopTakeover = refuseFocusReveal(composer.ownerDocument, {
      isActive: () => isCoarsePointer(win),
      claim: destination => findTextEntryControl(destination, composer),
      park: origin => {
        if (findTextEntryControl(origin, composer) != null) {
          parkFocus(composer, readModality());
        }
      },
    });
    return () => {
      stopTakeover();
      composer.removeAttribute('role');
    };
  }, [touchPresentation.isTouch, readModality, scrollRef, dockRevealVersion]);

  // A focus call skips the browser's reveal only where ChatLayout keeps the
  // composer above the keyboard itself. The server has no keyboard profile.
  const readKeyboardSurface = useCallback(() => {
    const scroller = scrollRef.current;
    const win = scroller?.ownerDocument.defaultView;
    return win == null || !leavesRevealToBrowser(win, scroller);
  }, [scrollRef]);
  const isKeyboardSurface = useSyncExternalStore(
    subscribeDockReveal,
    readKeyboardSurface,
    readKeyboardSurfaceOnServer,
  );

  return {
    lift,
    dockRef: dock.ref,
    messagesRef: messages.ref,
    composerRef,
    isKeyboardSurface,
  };
}

const readKeyboardSurfaceOnServer = () => true;

// A page that scrolls the document, in a browser with no layout guide: there
// the browser may reveal the fixed dock itself.
function isUnguidedDocument(win: Window, scroller: Element | null): boolean {
  return isDocumentScroller(scroller) && keyboardProfileOf(win) !== 'chromium';
}

/**
 * Whether the browser keeps focus and the composer's reveal. That is a page
 * that scrolls the document, in a browser with no layout guide. It holds
 * until a keyboard show finds the fixed dock left covered. Safari on iOS pans
 * the visual viewport to the dock, and a lift would add to that pan. Firefox
 * for Android can leave it covered: from then on, the layout keeps the
 * composer above the keyboard itself.
 */
function leavesRevealToBrowser(win: Window, scroller: Element | null): boolean {
  return isUnguidedDocument(win, scroller) && !isDockLeftCovered(win);
}

// The document's root and body both scroll the page.
function isDocumentScroller(scroller: Element | null): boolean {
  if (scroller == null) {
    return false;
  }
  const doc = scroller.ownerDocument;
  return (
    scroller === doc.scrollingElement ||
    scroller === doc.documentElement ||
    scroller === doc.body
  );
}

/** A compositor animator for one element, bound through a stable callback ref. */
function useElementAnimator(): {
  readonly ref: (element: HTMLElement | null) => void;
  readonly animator: Animator;
} {
  const [result] = useState(() => {
    const animator = createMotionEngine(null);
    return {
      animator,
      ref: (element: HTMLElement | null) => animator.attach(element),
    };
  });
  return result;
}
