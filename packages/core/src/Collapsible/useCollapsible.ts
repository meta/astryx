// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCollapsible.ts
 * @input React state, ids and layout effects; CollapsibleGroupContext; the
 *   Reduce Motion setting and the theme's reduced-motion mark
 * @output useCollapsible and its option and return types
 * @position Headless disclosure: the open-state machine (group, controlled,
 *   uncontrolled) and the props a caller-rendered trigger and content need.
 *   Collapsible and Banner use it.
 *
 * SYNC: When modified, update /packages/core/src/Collapsible/index.ts
 * (exports) and /packages/core/src/Collapsible/useCollapsible.doc.mjs.
 */

import {
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import {flushSync} from 'react-dom';
import {CollapsibleGroupContext} from './CollapsibleGroupContext';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {themeReducesMotion} from '../privateAttributes/reducedMotion.stylex';
import {matchesMediaQuery} from '../utils/coarsePointer';

/**
 * Configuration for collapsible behavior.
 */
export type CollapsibleConfig = {
  /** Default open state for uncontrolled usage. @default true */
  defaultIsOpen?: boolean;
  /** Controlled open state. */
  isOpen?: boolean;
  /** Callback when open state changes. */
  onOpenChange?: (isOpen: boolean) => void;
};

export interface UseCollapsibleOptions {
  /**
   * Whether the component is collapsible.
   * - `true` — self-managed, starts open
   * - `{ defaultIsOpen: false }` — self-managed, starts collapsed
   * - `{ isOpen, onOpenChange }` — controlled externally
   */
  isCollapsible?: boolean | CollapsibleConfig;
  /**
   * Unique identifier within an CollapsibleGroup.
   * When present and inside a group, defers state to the group.
   */
  value?: string;
  /**
   * Whether the element that gets `contentProps` plays its own CSS animation
   * when it opens and closes. With it, `isEntering` and `isExiting` stay true
   * while that animation plays, and `isPresent` stays true through the close
   * animation. Under Reduce Motion, or when no animation plays, both end at
   * once.
   * @default false
   */
  hasContentAnimation?: boolean;
  /**
   * A CSS custom property for the content's natural height. At each open,
   * and at each close that keeps the children, the hook measures the height
   * once and writes it to this property on the content element, as a `px`
   * value that `height` can take. The measurement ignores the content's CSS
   * animation, so keyframes can grow from `0px` to `var(<property>)`.
   */
  contentHeightProperty?: `--${string}`;
}

export interface UseCollapsibleReturn {
  /** Whether collapsible behavior is enabled. */
  isEnabled: boolean;
  /** Whether the content is currently open/expanded. */
  isOpen: boolean;
  /** Toggle the open/closed state. */
  toggle: () => void;
  /**
   * Whether to render the content's children: while open, and while the
   * close animation plays (`hasContentAnimation`). Render nothing inside the
   * content element otherwise.
   */
  isPresent: boolean;
  /** Whether the content's open animation is playing (`hasContentAnimation`). */
  isEntering: boolean;
  /** Whether the content's close animation is playing (`hasContentAnimation`). */
  isExiting: boolean;
  /**
   * Props to spread on the trigger: a `<button>`, or a component that renders
   * one.
   */
  triggerProps: {
    /** Activation toggles the content and never submits a form. */
    type: 'button';
    /** Whether the content is open. */
    'aria-expanded': boolean;
    /** The id of the content element, which stays rendered while closed. */
    'aria-controls': string;
    /** Toggles the open state. */
    onClick: () => void;
  };
  /** Props to spread on the content element. */
  contentProps: {
    /** The id the trigger's `aria-controls` names. */
    id: string;
    /** Hidden when the content is closed and its close animation is over. */
    hidden: boolean;
    /** Inert while the close animation plays. */
    inert: boolean;
    /** The element the hook measures and watches for its animations. */
    ref: RefCallback<HTMLElement>;
  };
}

type ContentMotion = 'entering' | 'exiting' | null;

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function reducesMotion(node: HTMLElement): boolean {
  return (
    matchesMediaQuery(node.ownerDocument.defaultView, REDUCE_MOTION_QUERY) ||
    themeReducesMotion(node)
  );
}

/**
 * Whether a finite CSS animation is running on `node` itself. Transitions,
 * endless animations, and animations of its descendants do not count. A DOM
 * without the Web Animations API (a test DOM) runs none.
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

/** Whether the content's motion phase must wait for a running animation. */
function holdsMotion(node: HTMLElement): boolean {
  return !reducesMotion(node) && isAnimating(node);
}

/**
 * The height that `height` takes to fit the content. A transform scales the
 * rendered box but not the layout box, so a scaled ancestor falls back to the
 * whole-pixel layout height.
 */
function naturalHeight(node: HTMLElement): number {
  const rendered = node.getBoundingClientRect().height;
  const layout = node.offsetHeight;
  const height = Math.abs(rendered - layout) < 1 ? rendered : layout;
  const view = node.ownerDocument.defaultView;
  const style = view?.getComputedStyle(node);
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
 * Suppresses the element's CSS animations until the returned function runs.
 * The open keyframes start at 0 and the close keyframes at the measured
 * height, so a read with them applied gets a keyframe value.
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

/** Content elements that wait for a height measurement, with their property. */
const pendingHeights = new Map<HTMLElement, string>();

/**
 * Measures every content element that changes in one commit in one pass:
 * all writes, then all reads, then all writes. Rows of an accordion that open
 * and close together then force one layout, not one each. The pass runs in a
 * microtask, after the commit and before the frame paints.
 */
function measureNaturalHeight(node: HTMLElement, property: string): void {
  if (pendingHeights.size === 0) {
    queueMicrotask(flushNaturalHeights);
  }
  pendingHeights.set(node, property);
}

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
 * Hook that encapsulates collapsible state management, and the props that
 * wire a caller-rendered trigger to its content.
 *
 * Supports three modes:
 * 1. **Group-controlled**: When inside a CollapsibleGroup with a `value`, defers to group.
 * 2. **Controlled**: When `isOpen` is provided in config, the parent owns state;
 *    `toggle` only calls `onOpenChange` and never mutates internal state.
 * 3. **Uncontrolled**: Self-managed internal state with optional `defaultIsOpen`.
 *    `onOpenChange`, if supplied, is invoked in addition to the internal update —
 *    it is a notification callback, not a signal that the component is controlled.
 *
 * `triggerProps` go on a `<button>`, and `contentProps` on the element that
 * holds the content. That element stays rendered while closed, so
 * `aria-controls` always names it; its children render only while
 * `isPresent`.
 *
 * @example
 * ```
 * const row = useCollapsible({isCollapsible: {defaultIsOpen: false}});
 * <button {...row.triggerProps}>Details</button>
 * <div {...row.contentProps}>{row.isPresent && <Details />}</div>
 * ```
 */
export function useCollapsible(
  options: UseCollapsibleOptions,
): UseCollapsibleReturn {
  const {
    isCollapsible,
    value,
    hasContentAnimation = false,
    contentHeightProperty,
  } = options;

  // Check for CollapsibleGroup context
  const group = use(CollapsibleGroupContext);
  const isControlledByGroup = group != null && value != null;

  // Parse config: true → empty config, object → as-is, false/undefined → null
  const config: CollapsibleConfig | null =
    isCollapsible === true ? {} : isCollapsible ? isCollapsible : null;
  const isEnabled = config != null;

  // Internal state for uncontrolled mode
  const [internalIsOpen, setInternalIsOpen] = useState(() => {
    if (isControlledByGroup) {
      return true;
    } // group manages this
    if (config?.isOpen !== undefined) {
      return config.isOpen;
    }
    return config?.defaultIsOpen ?? true;
  });

  // Determine open state from the appropriate source
  let isOpen: boolean;
  if (isControlledByGroup && value != null) {
    isOpen = group.isOpen(value);
  } else if (config?.isOpen !== undefined) {
    isOpen = config.isOpen;
  } else {
    isOpen = internalIsOpen;
  }

  // Toggle handler dispatches to the appropriate controller.
  //
  // Controlled vs uncontrolled is decided by whether `isOpen` was provided —
  // mirroring how `isOpen` is derived above. `onOpenChange` is a notification
  // callback, not a signal of control: an uncontrolled component may still want
  // to observe changes. So in uncontrolled mode we drive internal state AND
  // fire the callback; only in controlled mode do we defer entirely to the
  // parent via the callback.
  const toggle = () => {
    if (isControlledByGroup && value != null) {
      group.toggle(value);
      return;
    }
    const next = !isOpen;
    // Uncontrolled: internal state is the source of truth, so update it.
    if (config?.isOpen === undefined) {
      setInternalIsOpen(next);
    }
    // Always notify — for both controlled and uncontrolled usage.
    config?.onOpenChange?.(next);
  };

  const contentId = useId();

  // Each open-state change while mounted starts a motion phase. A mount starts
  // none, so content that mounts open does not replay its open animation. The
  // hook derives the phase during render, so the commit that opens or closes
  // carries it.
  const [renderedIsOpen, setRenderedIsOpen] = useState(isOpen);
  const [motionState, setMotionState] = useState<ContentMotion>(null);
  if (renderedIsOpen !== isOpen) {
    setRenderedIsOpen(isOpen);
    setMotionState(
      hasContentAnimation ? (isOpen ? 'entering' : 'exiting') : null,
    );
  }
  const motion = hasContentAnimation ? motionState : null;
  const isExiting = motion === 'exiting';
  const isPresent = isOpen || isExiting;

  const contentNodeRef = useRef<HTMLElement | null>(null);
  const motionRef = useCommittedRef(motion);
  const contentRef = useCallback(
    (node: HTMLElement | null) => {
      contentNodeRef.current = node;
      if (node == null || !hasContentAnimation) {
        return;
      }
      // An element that replaces the content during a phase ends the phase,
      // unless an animation of its own holds it.
      if (motionRef.current != null && !holdsMotion(node)) {
        setMotionState(null);
      }
      // The content's own animation ends the phase. A descendant's animation
      // events bubble here, and the target check skips them.
      const onAnimationDone = (event: AnimationEvent) => {
        if (event.target !== node || holdsMotion(node)) {
          return;
        }
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- a closed panel must drop its children in the frame its close animation ends, or that frame paints them at full height
        flushSync(() => {
          setMotionState(null);
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
    [hasContentAnimation, motionRef],
  );

  const wasOpenRef = useRef(isOpen);
  // Syncs the content element's layout and CSS animations with an open-state
  // change, before the frame paints. It ends a motion phase that no running
  // animation holds. It queues the height measurement for an open, and for a
  // close that keeps the children.
  useLayoutEffect(() => {
    const isChange = wasOpenRef.current !== isOpen;
    wasOpenRef.current = isOpen;
    const node = contentNodeRef.current;
    const isHeld = motion != null && node != null && holdsMotion(node);
    if (
      node != null &&
      isChange &&
      contentHeightProperty != null &&
      (isOpen || isHeld)
    ) {
      measureNaturalHeight(node, contentHeightProperty);
    }
    if (motion != null && !isHeld) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- the phase ends from the animation state read in this commit, before the frame paints
      setMotionState(null);
    }
  }, [isOpen, motion, contentHeightProperty]);

  return {
    isEnabled,
    isOpen,
    toggle,
    isPresent,
    isEntering: motion === 'entering',
    isExiting,
    triggerProps: {
      type: 'button',
      'aria-expanded': isOpen,
      'aria-controls': contentId,
      onClick: toggle,
    },
    contentProps: {
      id: contentId,
      hidden: !isPresent,
      inert: isExiting,
      ref: contentRef,
    },
  };
}
