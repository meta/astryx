// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCollapsibleContentMotion.ts
 * @input A useCollapsible result; the content element's animations and layout
 * @output useCollapsibleContentMotion and its option and return types
 * @position Opt-in content motion, in its own module: a page that does not
 *   import it carries none of it
 *
 * SYNC: update index.ts and useCollapsibleContentMotion.doc.mjs with it.
 */

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import {flushSync} from 'react-dom';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {reducedMotionFade} from '../motion/reducedMotion';
import {sharedMap} from '../utils/sharedRealm';
import type {UseCollapsibleReturn} from './useCollapsible';

export interface UseCollapsibleContentMotionOptions {
  /**
   * A custom property that gets the content's natural height in `px`, read
   * without its animation at each open and each close that keeps the children.
   */
  heightProperty?: `--${string}`;
}

export interface UseCollapsibleContentMotionReturn {
  /** Whether to render the children: while open, and through the close animation. */
  isPresent: boolean;
  /** Whether the content's open animation is playing. */
  isEntering: boolean;
  /** Whether the content's close animation is playing. */
  isExiting: boolean;
  /** Props for the content element, in place of the `useCollapsible` ones. */
  contentProps: {
    id: string;
    /** Hidden once closed and the close animation is over. */
    hidden: boolean;
    /** Inert while the close animation plays. */
    inert: boolean;
    ref: RefCallback<HTMLElement>;
  };
}

type ContentMotion = 'entering' | 'exiting' | null;

/**
 * Whether a finite CSS animation runs on `node` itself. Transitions, endless
 * animations, and descendants' animations do not count.
 */
function isAnimating(node: HTMLElement): boolean {
  if (typeof node.getAnimations !== 'function') {
    return false;
  }
  return node
    .getAnimations()
    .some(
      animation =>
        'animationName' in animation &&
        animation.playState === 'running' &&
        Number.isFinite(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        ),
    );
}

/** Whether the running animation holds the phase, under the Reduce Motion policy. */
function holdsMotion(node: HTMLElement): boolean {
  return reducedMotionFade(node)?.duration !== 0 && isAnimating(node);
}

/** The `height` that fits the content: the layout height under a scaled ancestor. */
function naturalHeight(node: HTMLElement): number {
  const rendered = node.getBoundingClientRect().height;
  const layout = node.offsetHeight;
  const height = Math.abs(rendered - layout) < 1 ? rendered : layout;
  const style = node.ownerDocument.defaultView?.getComputedStyle(node);
  if (style == null || style.boxSizing !== 'content-box') {
    return height;
  }
  const edges = [
    style.paddingTop,
    style.paddingBottom,
    style.borderTopWidth,
    style.borderBottomWidth,
  ].reduce((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
  return Math.max(0, height - edges);
}

/**
 * Suppresses the element's CSS animations until the returned function runs,
 * because a read with the keyframes applied gets a keyframe height.
 */
function suppressAnimation(node: HTMLElement): () => void {
  const {style} = node;
  const ownName = style.getPropertyValue('animation-name');
  const ownPriority = style.getPropertyPriority('animation-name');
  style.setProperty('animation-name', 'none', 'important');
  return () => {
    if (ownName === '') {
      style.removeProperty('animation-name');
    } else {
      style.setProperty('animation-name', ownName, ownPriority);
    }
  };
}

/** Content elements that wait for a measurement. Every copy of Core shares it. */
const pendingHeights = sharedMap<HTMLElement, string>(
  'collapsible/use-collapsible-content-motion/pending-heights',
  1,
);

/** Queues the element for the pass that runs after the commit, before paint. */
function queueNaturalHeight(node: HTMLElement, property: string): void {
  if (pendingHeights.size === 0) {
    queueMicrotask(flushNaturalHeights);
  }
  pendingHeights.set(node, property);
}

/** Measures every queued element in one layout: all writes, reads, then writes. */
function flushNaturalHeights(): void {
  const entries = [...pendingHeights].filter(([node]) => node.isConnected);
  pendingHeights.clear();
  const restores = entries.map(([node]) => suppressAnimation(node));
  const heights = entries.map(([node]) => naturalHeight(node));
  entries.forEach(([node, property], index) => {
    restores[index]?.();
    node.style.setProperty(property, `${heights[index]}px`);
  });
}

/**
 * Content motion for a `useCollapsible` disclosure: open and close phases that
 * last while the content element's own CSS animation plays, and the children
 * kept through the close. Key the keyframes on `isEntering` and `isExiting`.
 *
 * @example
 * ```
 * const row = useCollapsible({isCollapsible: {defaultIsOpen: false}});
 * const motion = useCollapsibleContentMotion(row, {heightProperty: '--row-height'});
 * <button {...row.triggerProps}>Details</button>
 * <div {...motion.contentProps}>{motion.isPresent && <Details />}</div>
 * ```
 */
export function useCollapsibleContentMotion(
  collapsible: Pick<UseCollapsibleReturn, 'isOpen' | 'contentProps'>,
  options: UseCollapsibleContentMotionOptions = {},
): UseCollapsibleContentMotionReturn {
  const {isOpen} = collapsible;
  const {heightProperty} = options;

  // A change starts a phase in the render that makes it. A mount starts none,
  // so content that mounts open does not replay its open animation.
  const [renderedIsOpen, setRenderedIsOpen] = useState(isOpen);
  const [motion, setMotion] = useState<ContentMotion>(null);
  if (renderedIsOpen !== isOpen) {
    setRenderedIsOpen(isOpen);
    setMotion(isOpen ? 'entering' : 'exiting');
  }
  const isExiting = motion === 'exiting';
  const isPresent = isOpen || isExiting;

  const contentNodeRef = useRef<HTMLElement | null>(null);
  const motionRef = useCommittedRef(motion);
  const contentRef = useCallback(
    (node: HTMLElement | null) => {
      contentNodeRef.current = node;
      if (node == null) {
        return;
      }
      // A replacement element ends the phase unless its own animation holds it.
      if (motionRef.current != null && !holdsMotion(node)) {
        setMotion(null);
      }
      // Descendants' animation events bubble here; the target check skips them.
      const onAnimationDone = (event: AnimationEvent) => {
        if (event.target !== node || holdsMotion(node)) {
          return;
        }
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the children leave in the frame the close animation ends
        flushSync(() => {
          setMotion(null);
        });
      };
      node.addEventListener('animationend', onAnimationDone);
      node.addEventListener('animationcancel', onAnimationDone);
      return () => {
        node.removeEventListener('animationend', onAnimationDone);
        node.removeEventListener('animationcancel', onAnimationDone);
        if (contentNodeRef.current === node) {
          contentNodeRef.current = null;
        }
      };
    },
    [motionRef],
  );

  const wasOpenRef = useRef(isOpen);
  // Syncs the content element's layout and CSS animations with an open-state
  // change, before paint: it queues the measurement and ends an unheld phase.
  useLayoutEffect(() => {
    const isChange = wasOpenRef.current !== isOpen;
    wasOpenRef.current = isOpen;
    const node = contentNodeRef.current;
    const isHeld = motion != null && node != null && holdsMotion(node);
    if (
      node != null &&
      isChange &&
      heightProperty != null &&
      (isOpen || isHeld)
    ) {
      queueNaturalHeight(node, heightProperty);
    }
    if (motion != null && !isHeld) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- the phase ends from the animation state this commit reads, before paint
      setMotion(null);
    }
  }, [isOpen, motion, heightProperty]);

  return {
    isPresent,
    isEntering: motion === 'entering',
    isExiting,
    contentProps: {
      id: collapsible.contentProps.id,
      hidden: !isPresent,
      inert: isExiting,
      ref: contentRef,
    },
  };
}
