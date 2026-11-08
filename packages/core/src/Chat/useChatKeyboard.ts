// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatKeyboard.ts
 * @input React refs, the keyboard module's height, focus routes and layout
 *   guide, the stream scroll's lock, the motion engine, the touch query and
 *   layout viewport height. Also the input stream's touches and wheels
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
  getKeyboardHeight,
  isTextEntryControl,
  refuseFocusReveal,
  subscribeKeyboardHeight,
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
import {useInteractionModalityTrackingFor} from '../utils/interactionModality';
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
function parkFocus(region: HTMLElement, showsRing: boolean): void {
  region.setAttribute('tabindex', '-1');
  if (!showsRing) {
    region.style.setProperty('outline', 'none');
  }
  region.addEventListener(
    'blur',
    () => {
      region.removeAttribute('tabindex');
      region.style.removeProperty('outline');
    },
    {once: true},
  );
  region.focus({preventScroll: true});
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
  // Whether this keyboard show is the one that found the dock covered, and
  // whether a touch or a wheel came since its report. Only that show, with no
  // input yet, can still meet a slow browser's own pan to the dock.
  const classifyingShowRef = useRef(false);
  const inputSinceReportRef = useRef(false);
  // What this window's browser did at a keyboard show, for the effects below.
  const revealVersion = useSyncExternalStore(
    subscribeReveal,
    readRevealVersion,
    readRevealVersion,
  );
  // Set while the guide's ride is under way: the layout waits for it. Each
  // ride's number, so only the latest one hands its translate back.
  const ridingRef = useRef(false);
  const rideRef = useRef(0);
  // Where the last ride took the dock's and the transcript's translates
  // (null: the transcript did not ride), until the layout takes them over.
  const dockTargetRef = useRef<number | null>(null);
  const messagesTargetRef = useRef<number | null>(null);
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
    // Where the browser keeps focus and the composer's reveal, each keyboard
    // show decides once whether the dock rises. A browser that pans the
    // visual viewport to the fixed dock reveals it: the dock rises nothing,
    // so a lift never adds to the pan. A dock still covered once the visual
    // viewport has settled rises by the keyboard's cover, as elsewhere.
    const unguidedDocument =
      isDocumentScroller(scrollRef.current) &&
      keyboardProfileOf(win) !== 'chromium';
    const leavesReveal = leavesRevealToBrowser(win, scrollRef.current);
    // The fingers down on the page. A pan under a finger is the reader's, not
    // the browser's reveal.
    let touchesDown = 0;
    const onInput = (event: Event) => {
      if (event.type !== 'wheel') {
        touchesDown = (event as TouchEvent).touches?.length ?? 0;
      }
      if (event.type === 'touchstart' || event.type === 'wheel') {
        inputSinceReportRef.current = true;
      }
    };
    const stopInput = unguidedDocument
      ? (['touchstart', 'touchend', 'touchcancel', 'wheel'] as const).map(
          type => subscribeInput(win, type, onInput),
        )
      : [];
    // A pan that reveals the fixed dock, with no finger down: with no lift,
    // the dock would rest at or above the visual viewport's bottom.
    const isRevealPan = (pan: number | null, inset: number) =>
      pan != null && inset > 0 && touchesDown === 0 && pan >= inset - 1;
    let reveal: 'none' | 'watching' | 'revealed' | 'covered' = 'none';
    let revealFrame = 0;
    let coveredAt = 0;
    // The visual viewport's pan with no keyboard up: a show's pan is measured
    // from it.
    let restPan = 0;
    // The visual viewport's pan, or null under a pinch zoom, whose pan is the
    // reader's.
    const panOf = () => {
      const viewport = win.visualViewport;
      return viewport != null && viewport.scale === 1
        ? viewport.offsetTop
        : null;
    };
    const stopWatching = () => {
      if (revealFrame !== 0) {
        win.cancelAnimationFrame(revealFrame);
        revealFrame = 0;
      }
    };
    const watchReveal = () => {
      stopWatching();
      const startPan = panOf();
      if (startPan != null && startPan >= getKeyboardHeight(win) - 1) {
        // Revealed at the report. Only a pan there shows what the browser
        // does; a show that needed none teaches nothing.
        reveal = 'revealed';
        if (startPan > restPan + 0.5) {
          learnReveal(win, true);
        }
        return;
      }
      reveal = 'watching';
      const start = win.performance.now();
      let height = win.visualViewport?.height;
      let lastPan = startPan;
      let stillFrames = 0;
      const step = () => {
        revealFrame = 0;
        const pan = panOf();
        const inset = getKeyboardHeight(win);
        if (inset <= 0) {
          reveal = 'none';
          return;
        }
        // A pan that reveals the dock is the browser's reveal. A smaller one,
        // or one under a finger, only restarts the count.
        if (isRevealPan(pan, inset) && pan != null && pan > restPan + 0.5) {
          reveal = 'revealed';
          learnReveal(win, true);
          return;
        }
        const nextHeight = win.visualViewport?.height;
        const isStill = nextHeight === height && pan === lastPan;
        stillFrames = isStill ? stillFrames + 1 : 0;
        height = nextHeight;
        lastPan = pan;
        const settled = stillFrames >= REVEAL_SETTLE_FRAMES;
        if (settled || win.performance.now() - start >= REVEAL_WAIT_CAP_MS) {
          reveal = 'covered';
          coveredAt = win.visualViewport?.offsetTop ?? 0;
          commit();
          // A dock still covered on a still visual viewport: this browser
          // reveals no fixed dock. From the next render on, the layout keeps
          // the composer above the keyboard itself, with no wait.
          if (settled) {
            classifyingShowRef.current = true;
            learnReveal(win, false);
          }
          return;
        }
        revealFrame = win.requestAnimationFrame(step);
      };
      revealFrame = win.requestAnimationFrame(step);
    };
    // A sticky dock rests at the root's bottom edge, which may sit above or
    // below the layout viewport's; a fixed dock rests at the viewport's.
    // While a keyboard is up the dock rises until it clears the keyboard's
    // cover; without one it rests where the layout puts it.
    const liftFor = (inset: number) => {
      if (inset <= 0 || (leavesReveal && reveal !== 'covered')) {
        return 0;
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
      if (Math.abs(next - liftRef.current) < 0.5) {
        return;
      }
      atEndRef.current = isAtEnd();
      scrollBeforeRef.current = scrollRef.current?.scrollTop ?? 0;
      liftStore.set(next);
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
    // so a ride claims the change first.
    let reportedHeight = getKeyboardHeight(win);
    const unsubscribeHeight = subscribeKeyboardHeight(win, event => {
      if (event.type !== 'viewport') {
        return;
      }
      if (event.height > 0 && reportedHeight <= 0) {
        inputSinceReportRef.current = false;
      } else if (event.height <= 0) {
        classifyingShowRef.current = false;
      }
      if (leavesReveal) {
        const viewport = win.visualViewport;
        if (event.height <= 0) {
          stopWatching();
          reveal = 'none';
          restPan = panOf() ?? 0;
        } else if (reveal === 'none') {
          watchReveal();
        } else if (
          reveal === 'covered' &&
          viewport != null &&
          viewport.scale === 1 &&
          viewport.offsetTop > coveredAt + 0.5 &&
          !inputSinceReportRef.current &&
          isRevealPan(viewport.offsetTop, event.height)
        ) {
          // The browser panned to the dock after the wait: the lift goes, and
          // it does not come back in this show.
          reveal = 'revealed';
          learnReveal(win, true);
          commit();
        }
      } else if (
        unguidedDocument &&
        liftRef.current > 0 &&
        classifyingShowRef.current &&
        !inputSinceReportRef.current &&
        isRevealPan(panOf(), event.height)
      ) {
        // A slow browser panned to the dock after the show that found it
        // covered, before any input. The lift goes once, and the browser
        // keeps the reveal. A pan after a touch or a wheel is the reader's.
        learnReveal(win, true);
      }
      if (event.height !== reportedHeight) {
        reportedHeight = event.height;
        commit();
      }
    });
    // Mounted under a keyboard that is already up: take its place at once.
    if (leavesReveal && reportedHeight > 0) {
      watchReveal();
    } else {
      restPan = panOf() ?? 0;
    }
    commit();
    return () => {
      unsubscribeHeight();
      unsubscribe?.();
      stopWatching();
      for (const stop of stopInput) {
        stop();
      }
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
    revealVersion,
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
  }, [touchPresentation.isTouch, scrollRef, revealVersion]);

  // A browser that reveals the composer itself pans the visual viewport after
  // the keyboard's report, while the composer still rides up. Chrome 124 on
  // Android pans by the keyboard's whole height. The keyboard module's
  // reveal-pan watch puts the pan back, so the page does not move.
  // Synchronizes the keyboard module's reports, under a finger only.
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
    const pans = watchPans(win, focused => composer.contains(focused));
    const unsubscribe = subscribeKeyboardHeight(win, event => {
      if (event.type === 'viewport') {
        pans.report(event.height);
      }
    });
    return () => {
      unsubscribe();
      pans.stop();
    };
  }, [touchPresentation.isTouch, scrollRef, revealVersion]);

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
          parkFocus(composer, readModality() === 'keyboard');
        }
      },
    });
    return () => {
      stopTakeover();
      composer.removeAttribute('role');
    };
  }, [touchPresentation.isTouch, readModality, scrollRef, revealVersion]);

  // A focus call skips the browser's reveal only where ChatLayout keeps the
  // composer above the keyboard itself. The server has no keyboard profile.
  const readKeyboardSurface = useCallback(() => {
    const scroller = scrollRef.current;
    const win = scroller?.ownerDocument.defaultView;
    return win == null || !leavesRevealToBrowser(win, scroller);
  }, [scrollRef]);
  const isKeyboardSurface = useSyncExternalStore(
    subscribeReveal,
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

// How long a keyboard show waits for the browser's own pan to the dock. The
// visual viewport must stay still for these frames, with a cap in wall time.
// A busy device draws fewer frames, so it waits longer. Safari on iOS pans up
// to about 400 ms after the keyboard's report.
const REVEAL_SETTLE_FRAMES = 40;
const REVEAL_WAIT_CAP_MS = 3000;

const readKeyboardSurfaceOnServer = () => true;

// What each window's browser did with a fixed dock at a keyboard show. True:
// it panned the visual viewport to reveal the dock. False: the dock stayed
// covered. Unknown until the first show.
const revealLearned = new WeakMap<Window, boolean>();
const revealListeners = new Set<() => void>();
let revealVersionNow = 0;
function learnReveal(win: Window, pans: boolean): void {
  if (revealLearned.get(win) === pans) {
    return;
  }
  revealLearned.set(win, pans);
  revealVersionNow += 1;
  for (const listener of revealListeners) {
    listener();
  }
}
function subscribeReveal(listener: () => void): () => void {
  revealListeners.add(listener);
  return () => {
    revealListeners.delete(listener);
  };
}
const readRevealVersion = () => revealVersionNow;

/** What `win`'s browser was found to do with a fixed dock (tests only). */
export function __revealLearnedForTest(win: Window): boolean | undefined {
  return revealLearned.get(win);
}

/** Forgets what `win`'s browser was found to do (tests only). */
export function __resetRevealForTest(win: Window): void {
  if (revealLearned.delete(win)) {
    revealVersionNow += 1;
    for (const listener of revealListeners) {
      listener();
    }
  }
}

/** Records what `win`'s browser did with a fixed dock (tests only). */
export const __learnRevealForTest = learnReveal;

/** Whether ChatLayout leaves the composer's reveal to `win` (tests only). */
export const __leavesRevealToBrowserForTest = leavesRevealToBrowser;

/**
 * Whether the browser keeps focus and the composer's reveal. That is a page
 * that scrolls the document, in a browser with no layout guide. It holds
 * until a keyboard show finds the fixed dock left covered. Safari on iOS pans
 * the visual viewport to the dock, and a lift would add to that pan. Firefox
 * for Android leaves it covered: from then on, the layout keeps the composer
 * above the keyboard itself.
 */
function leavesRevealToBrowser(win: Window, scroller: Element | null): boolean {
  return (
    isDocumentScroller(scroller) &&
    keyboardProfileOf(win) !== 'chromium' &&
    revealLearned.get(win) !== false
  );
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
