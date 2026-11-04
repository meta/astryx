// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useChatStreamScroll.ts
 * @input Uses React refs, state, callbacks, useMediaQuery
 * @output Exports useChatStreamScroll hook for AI chat scroll behavior
 * @position Utility hook — used by ChatLayout, also usable standalone
 *
 * Spring-based scroll-to-bottom with lock/unlock:
 * - Locked (default): content growth auto-scrolls to bottom via rAF spring
 * - Scrolling up (any source): unlocks immediately
 * - Scrolling settles at bottom: re-locks on scrollend
 * - The first fill positions instantly (whether content is present at
 *   mount or arrives async); only subsequent growth springs
 * - `scrollToBottom({behavior: 'instant'})` jumps in one frame, no animation
 * - Under `prefers-reduced-motion`, every spring path falls back to the
 *   same instant jump — following still works, it just doesn't animate
 * - Fractional spring position is retained between frames so browsers that
 *   round scrollTop do not strand the animation short of the bottom
 *
 * Reads user intent from position: a scroll that lands above the last
 * position this hook set or saw is the reader — wheel, touch, scrollbar
 * drag, keyboard, everything, including a move the spring's next frame
 * would otherwise outrun. While following, the hook owns the position:
 * it disables scroll anchoring on the container, so the only move the
 * browser makes on its own is a resize clamp onto the bottom.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Chat/index.ts (exports)
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useMediaQuery} from '../hooks/useMediaQuery';

// =============================================================================
// Types
// =============================================================================

export interface ChatScrollToBottomOptions {
  /**
   * `'instant'` jumps to the bottom in a single frame instead of running
   * the spring animation. Use for programmatic positioning (opening a
   * conversation, restoring a session) — keep the default `'spring'` for
   * user-initiated scrolls like the scroll-to-bottom button. Mirrors the
   * DOM's `scrollTo({behavior})`. When the user prefers reduced motion,
   * `'spring'` also jumps instantly.
   * @default 'spring'
   */
  behavior?: 'instant' | 'spring';
}

export interface UseChatStreamScrollOptions {
  /**
   * Ref to the scrollable container element.
   */
  scrollRef: React.RefObject<HTMLElement | null>;

  /**
   * Whether scroll behavior is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Distance from bottom (in px) within which scrollend re-locks.
   * Keep small so users aren't yanked back from a slight scroll.
   * @default 10
   */
  lockThreshold?: number;

  /**
   * Distance from bottom (in px) beyond which the scroll-to-bottom
   * button becomes visible.
   * @default 100
   */
  buttonThreshold?: number;

  /**
   * Spring damping — how quickly the animation settles.
   * @default 0.7
   */
  damping?: number;

  /**
   * Spring stiffness — how fast the animation accelerates.
   * @default 0.05
   */
  stiffness?: number;

  /**
   * Spring mass — higher = slower animation.
   * @default 1.25
   */
  mass?: number;
}

export interface UseChatStreamScrollReturn {
  /** Whether the user has scrolled up past buttonThreshold. */
  isScrolledUp: boolean;

  /** Whether auto-scroll is locked (following content). */
  isLocked: boolean;

  /** Scroll to the bottom of the container and re-lock. */
  scrollToBottom: (options?: ChatScrollToBottomOptions) => void;

  /** Scroll so a specific element is at the top of the visible area. No lock change. */
  scrollToMessage: (el: HTMLElement) => void;

  /** Lock auto-scroll and scroll to bottom. */
  lock: () => void;

  /** Unlock auto-scroll. */
  unlock: () => void;

  /** Scroll to bottom if currently locked. Call on content resize. */
  scrollIfLocked: () => void;

  /** Scroll to the last message in the container. */
  scrollToLastMessage: () => void;
}

// =============================================================================
// Hook
// =============================================================================

const SIXTY_FPS_MS = 1000 / 60;

// While following, the hook owns the container's position, so the browser's
// scroll anchoring must not move it. The rule rides on an attribute rather
// than the element's inline style: a consumer's own `overflow-anchor` is never
// read, written or restored — it simply applies again once the attribute is
// gone. `!important` so an inline `auto` cannot switch anchoring back on under
// a following container; an inline `!important` still wins, deliberately.
const FOLLOWING_ATTR = 'data-astryx-chat-following';
const FOLLOWING_STYLE_ATTR = 'data-astryx-chat-following-style';

function ensureFollowingStyle(): void {
  if (
    typeof document === 'undefined' ||
    document.head.querySelector(`[${FOLLOWING_STYLE_ATTR}]`)
  ) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute(FOLLOWING_STYLE_ATTR, '');
  style.textContent = `[${FOLLOWING_ATTR}]{overflow-anchor:none !important}`;
  document.head.appendChild(style);
}

export function useChatStreamScroll({
  scrollRef,
  enabled = true,
  lockThreshold = 10,
  buttonThreshold = 100,
  damping = 0.7,
  stiffness = 0.05,
  mass = 1.25,
}: UseChatStreamScrollOptions): UseChatStreamScrollReturn {
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

  const lockedRef = useRef(true);
  // True until the initial fill has been positioned — consumed by the first
  // scrollIfLocked that sees scrollable content.
  const initialFillPendingRef = useRef(true);
  const velocityRef = useRef(0);
  const springPositionRef = useRef<number | undefined>(undefined);
  const animatingRef = useRef(false);
  const lastTickRef = useRef<number | undefined>(undefined);
  // The spring's pending frame, so a jump can cancel it for real.
  const rafRef = useRef<number>(0);
  // The last position this hook set or saw. Updated by every write of ours
  // (spring frame, jump, scrollToMessage) as well as by every scroll event,
  // so a reader's move that lands between two spring frames still shows as
  // "above where we put it" even when the next frame's write outran it.
  const lastScrollTopRef = useRef(0);

  // While following, this hook is the only thing that should move the
  // container: scroll anchoring is off, so the browser's one remaining move
  // is the resize clamp onto the bottom, and every other upward move is the
  // reader. Unlocked, the element's own anchoring applies again — a reader up
  // in the history wants it when content above them changes.
  const setLocked = useCallback(
    (locked: boolean) => {
      lockedRef.current = locked;
      setIsLocked(locked);
      scrollRef.current?.toggleAttribute(FOLLOWING_ATTR, locked);
    },
    [scrollRef],
  );

  // --- Spring animation ---

  const animate = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !lockedRef.current) {
      animatingRef.current = false;
      lastTickRef.current = undefined;
      velocityRef.current = 0;
      return;
    }

    if (el.scrollHeight <= el.clientHeight) {
      animatingRef.current = false;
      lastTickRef.current = undefined;
      velocityRef.current = 0;
      return;
    }

    const target = el.scrollHeight - el.clientHeight;
    const position = Math.max(
      0,
      Math.min(target, springPositionRef.current ?? el.scrollTop),
    );
    const diff = target - position;

    if (Math.abs(diff) < 0.5 && Math.abs(velocityRef.current) < 0.1) {
      // eslint-disable-next-line react-compiler/react-compiler -- imperative DOM: scrollTop assignment
      el.scrollTop = target;
      animatingRef.current = false;
      lastTickRef.current = undefined;
      velocityRef.current = 0;
      return;
    }

    const now = performance.now();
    const tickDelta = lastTickRef.current
      ? (now - lastTickRef.current) / SIXTY_FPS_MS
      : 1;
    lastTickRef.current = now;

    velocityRef.current =
      (damping * velocityRef.current + stiffness * diff) / mass;
    springPositionRef.current = position + velocityRef.current * tickDelta;
    el.scrollTop = springPositionRef.current;
    lastScrollTopRef.current = el.scrollTop;

    rafRef.current = requestAnimationFrame(animate);
  }, [scrollRef, damping, stiffness, mass]);

  // Jump to the bottom in a single frame — cancels any in-flight spring so
  // a later animation tick can't fight the assignment.
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    cancelAnimationFrame(rafRef.current);
    animatingRef.current = false;
    velocityRef.current = 0;
    lastTickRef.current = undefined;
    el.scrollTop = el.scrollHeight - el.clientHeight;
    lastScrollTopRef.current = el.scrollTop;
  }, [scrollRef]);

  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );

  // Every spring entry point (scrollToBottom, lock, scrollIfLocked growth
  // follow) funnels through here, so this one branch covers them all.
  const startAnimation = useCallback(() => {
    if (!lockedRef.current) {
      return;
    }
    if (prefersReducedMotion) {
      jumpToBottom();
      return;
    }
    if (!animatingRef.current) {
      animatingRef.current = true;
      lastTickRef.current = undefined;
      springPositionRef.current = scrollRef.current?.scrollTop;
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [animate, jumpToBottom, prefersReducedMotion, scrollRef]);

  // --- Public API ---

  const scrollToBottom = useCallback(
    (options?: ChatScrollToBottomOptions) => {
      setLocked(true);
      setIsScrolledUp(false);
      initialFillPendingRef.current = false;
      if (options?.behavior === 'instant') {
        jumpToBottom();
        return;
      }
      startAnimation();
    },
    [setLocked, startAnimation, jumpToBottom],
  );

  const scrollToMessage = useCallback(
    (el: HTMLElement) => {
      const container = scrollRef.current;
      if (!container) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset = elRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({top: offset, behavior: 'instant'});
      lastScrollTopRef.current = container.scrollTop;
    },
    [scrollRef],
  );

  const scrollToLastMessage = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const messages = container.getElementsByClassName('astryx-chat-message');
    const last = messages[messages.length - 1];
    if (last instanceof HTMLElement) {
      scrollToMessage(last);
    }
  }, [scrollRef, scrollToMessage]);

  const lock = useCallback(() => {
    setLocked(true);
    setIsScrolledUp(false);
    startAnimation();
  }, [setLocked, startAnimation]);

  const unlock = useCallback(() => {
    setLocked(false);
    animatingRef.current = false;
  }, [setLocked]);

  const scrollIfLocked = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (!lockedRef.current) {
      return;
    }
    // Initial fill: content appearing for the first time (e.g. an
    // async-loaded conversation) positions in one frame instead of
    // spring-flying from the top. Stays pending through empty/loading
    // resizes until the container is actually scrollable.
    const el = scrollRef.current;
    if (
      initialFillPendingRef.current &&
      el &&
      el.scrollHeight > el.clientHeight
    ) {
      initialFillPendingRef.current = false;
      jumpToBottom();
      return;
    }
    startAnimation();
  }, [enabled, startAnimation, jumpToBottom, scrollRef]);

  // --- Event listeners ---

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) {
      return;
    }

    lastScrollTopRef.current = el.scrollTop;
    ensureFollowingStyle();
    el.toggleAttribute(FOLLOWING_ATTR, lockedRef.current);

    const onScroll = () => {
      const {scrollTop, scrollHeight, offsetHeight} = el;
      const dist = scrollHeight - scrollTop - offsetHeight;

      // Button visibility
      setIsScrolledUp(dist > buttonThreshold);

      const isScrollingUp = scrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      // With anchoring off, the browser only ever moves a following
      // container up to clamp it onto a new, smaller bottom, and a reader
      // scrolling up never lands there. (clientHeight, not dist: offsetHeight
      // includes borders and a horizontal scrollbar.)
      const landedAtBottom = scrollHeight - scrollTop - el.clientHeight < 1;

      if (isScrollingUp && !landedAtBottom && lockedRef.current) {
        setLocked(false);
        animatingRef.current = false;
      }
    };

    const onScrollEnd = () => {
      const dist = el.scrollHeight - el.scrollTop - el.offsetHeight;
      if (dist <= lockThreshold) {
        setLocked(true);
      }
    };

    el.addEventListener('scroll', onScroll, {passive: true});
    el.addEventListener('scrollend', onScrollEnd);

    // Initial scroll to bottom — content already present at mount.
    requestAnimationFrame(() => {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
        lastScrollTopRef.current = el.scrollTop;
        initialFillPendingRef.current = false;
      }
    });

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      el.removeAttribute(FOLLOWING_ATTR);
    };
  }, [scrollRef, enabled, lockThreshold, buttonThreshold, setLocked]);

  return {
    isScrolledUp,
    isLocked,
    scrollToBottom,
    scrollToMessage,
    lock,
    unlock,
    scrollIfLocked,
    scrollToLastMessage,
  };
}
