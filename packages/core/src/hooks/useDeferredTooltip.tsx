// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDeferredTooltip.tsx
 * @input The tooltip's options
 * @output Exports `useDeferredTooltip`: a tooltip's trigger contract (a ref
 *   for the trigger and its hidden description) and the tooltip surface,
 *   which loads on the trigger's first hover, focus or press
 * @position Internal base code for components with an optional tooltip, such
 *   as Button. Until the first intent, such a component carries no tooltip
 *   layer code. The intent made while the surface loads is held, and the
 *   surface answers it once by its own rules.
 */

import {
  useId,
  useState,
  type ReactNode,
  type RefCallback,
  type RefObject,
} from 'react';
import {createModuleLoader} from '../utils/moduleLoader';
import {warnOnce} from '../utils/devWarning';
import {isElement} from '../utils/nodeType';
import type {TooltipPresentInterestState} from '../Tooltip/tooltipPresentInterest';
import type {
  DeferredTooltip as DeferredTooltipType,
  DeferredTooltipConnect,
  DeferredTooltipOptions,
} from '../Tooltip/DeferredTooltip';

type DeferredTooltipComponent = typeof DeferredTooltipType;

const deferredTooltipModule = createModuleLoader(
  async () => import('../Tooltip/DeferredTooltip'),
);

export interface DeferredTooltipTrigger {
  /** Goes on the trigger element while the tooltip is set. */
  readonly ref: RefCallback<HTMLElement>;
  /** The id of the hidden description, for the trigger's `aria-describedby`. */
  readonly describedBy: string;
  /**
   * The hidden description: the tooltip text, in the markup before the
   * surface loads. Render it inside the trigger element: a sibling changes
   * the `:nth-last-child` that groups use to round their last member.
   */
  readonly renderDescription: (content: ReactNode) => ReactNode;
  /** The tooltip surface after the first intent has loaded it, else null. */
  readonly renderTooltip: (content: ReactNode) => ReactNode;
}

/**
 * A tooltip whose layer code loads on the trigger's first hover, focus or
 * press. The trigger is described by hidden text, so its description does not
 * change when the surface loads.
 */
export function useDeferredTooltip(
  options: DeferredTooltipOptions = {},
): DeferredTooltipTrigger {
  const describedBy = useId();
  // The surface mounts only after an intent on this trigger, so server and
  // hydrating markup never hold it.
  const [isWanted, setIsWanted] = useState(false);
  const [Surface, setSurface] = useState<DeferredTooltipComponent | null>(
    () => deferredTooltipModule.loaded()?.DeferredTooltip ?? null,
  );
  const [trigger] = useState(() =>
    createDeferredTrigger(
      () => setIsWanted(true),
      loaded => setSurface(() => loaded),
    ),
  );
  const renderDescription = (content: ReactNode): ReactNode => (
    <span id={describedBy} hidden>
      {content}
    </span>
  );
  const renderTooltip = (content: ReactNode): ReactNode =>
    isWanted && Surface != null ? (
      <Surface
        content={content}
        options={options}
        connect={trigger.connect}
        interestRef={trigger.interestRef}
      />
    ) : null;
  return {ref: trigger.ref, describedBy, renderDescription, renderTooltip};
}

interface DeferredTrigger {
  readonly ref: RefCallback<HTMLElement>;
  readonly connect: DeferredTooltipConnect;
  readonly interestRef: RefObject<TooltipPresentInterestState>;
}

/**
 * The trigger's native listeners hold the latest intent until the surface
 * reads it. They recognize no gesture: the browser's `click` after a touch or
 * pen press is the tap, and a press that becomes a scroll ends in
 * `pointercancel` with no `click`.
 */
function createDeferredTrigger(
  onWant: () => void,
  onLoad: (surface: DeferredTooltipComponent) => void,
): DeferredTrigger {
  const interestRef: RefObject<TooltipPresentInterestState> = {
    current: {interest: null, tapEvent: null, isRead: false},
  };
  let element: HTMLElement | null = null;
  let attachSurface: RefCallback<HTMLElement> | null = null;
  let detachSurface: (() => void) | null = null;
  // Whether the latest pointer is a finger, whose tap also sends `mouseenter`.
  let isTouchPointer = false;
  let isTouchPressPending = false;

  const load = () => {
    if (interestRef.current.isRead) {
      return;
    }
    deferredTooltipModule.load().then(
      loaded => onLoad(loaded.DeferredTooltip),
      (error: unknown) => {
        // The trigger stays operable. The next intent asks the loader again.
        const state = interestRef.current;
        if (!state.isRead) {
          state.interest = null;
          state.tapEvent = null;
        }
        warnOnce(
          'deferred-tooltip-load',
          'Tooltip',
          'The tooltip module did not load. Its trigger works without the tooltip.',
          error,
        );
      },
    );
  };

  const want = (
    interest: 'hover' | 'tap' | 'focus',
    tapEvent: Event | null = null,
  ) => {
    const state = interestRef.current;
    if (state.isRead) {
      return;
    }
    state.interest = interest;
    state.tapEvent = tapEvent;
    state.hoverStartedAt = interest === 'hover' ? performance.now() : undefined;
    onWant();
    load();
  };

  const forget = (interest: 'hover' | 'focus') => {
    const state = interestRef.current;
    if (!state.isRead && state.interest === interest) {
      state.interest = null;
    }
  };

  // A finger has no hover. A pen in range hovers as a mouse does.
  const handlePointerEnter = (event: PointerEvent) => {
    isTouchPointer = event.pointerType === 'touch';
  };
  const handleMouseEnter = () => {
    if (!isTouchPointer) {
      want('hover');
    }
  };
  const handleMouseLeave = () => forget('hover');
  const handlePointerDown = (event: PointerEvent) => {
    // A press cancels a held hover, as it cancels a pending hover show.
    forget('hover');
    isTouchPressPending =
      event.pointerType === 'touch' || event.pointerType === 'pen';
    isTouchPointer = isTouchPressPending;
    load();
  };
  const handlePointerCancel = () => {
    isTouchPressPending = false;
  };
  const handleClick = (event: MouseEvent) => {
    if (isTouchPressPending) {
      isTouchPressPending = false;
      want('tap', event);
    }
  };
  const handleFocusIn = (event: FocusEvent) => {
    // A tap's own focus is not an intent: its `click` is.
    if (
      isElement(event.target) &&
      event.target.matches(':focus-visible') &&
      !isTouchPressPending
    ) {
      want('focus');
    } else {
      load();
    }
  };
  const handleFocusOut = () => forget('focus');

  const ref: RefCallback<HTMLElement> = el => {
    if (el == null) {
      return;
    }
    element = el;
    el.addEventListener('pointerenter', handlePointerEnter);
    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointercancel', handlePointerCancel);
    el.addEventListener('click', handleClick);
    el.addEventListener('focusin', handleFocusIn);
    el.addEventListener('focusout', handleFocusOut);
    detachSurface = attachTo(attachSurface, el);
    return () => {
      el.removeEventListener('pointerenter', handlePointerEnter);
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointercancel', handlePointerCancel);
      el.removeEventListener('click', handleClick);
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
      detachSurface?.();
      detachSurface = null;
      isTouchPointer = false;
      isTouchPressPending = false;
      if (element === el) {
        element = null;
      }
    };
  };

  const connect: DeferredTooltipConnect = attach => {
    attachSurface = attach;
    if (element != null) {
      detachSurface = attachTo(attach, element);
    }
    return () => {
      if (attachSurface === attach) {
        attachSurface = null;
      }
      detachSurface?.();
      detachSurface = null;
    };
  };

  return {ref, connect, interestRef};
}

/** Calls `attach` with `element` and returns its detach. */
function attachTo(
  attach: RefCallback<HTMLElement> | null,
  element: HTMLElement,
): (() => void) | null {
  const detach = attach?.(element);
  return typeof detach === 'function' ? detach : null;
}
