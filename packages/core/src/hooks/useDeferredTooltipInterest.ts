// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDeferredTooltipInterest.ts
 * @input React, a module loader, the present-interest state
 * @output Exports useDeferredTooltipInterest and DeferredTooltipInterest
 * @position Internal to Core, not exported from any entry. A component that
 *   loads its tooltip on demand (truncated Text and Heading) holds the latest
 *   hover, tap or focus here with native events only, and starts the load. The
 *   tooltip that loads answers the held interaction through
 *   TooltipPresentInterestContext. It imports neither the touch trigger nor
 *   the layer runtime.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type {ModuleLoader} from '../utils/moduleLoader';
import {waitForPressClick} from '../utils/waitForPressClick';
import type {TooltipPresentInterestState} from '../Tooltip/tooltipPresentInterest';

export interface DeferredTooltipInterest<T> {
  /** Whether a hover, tap or focus has reached the element. It stays true. */
  readonly isWanted: boolean;
  /** The tooltip surface module, once it has loaded. */
  readonly loadedModule: T | null;
  /** The held interaction, until the loaded tooltip reads it. */
  readonly interestRef: RefObject<TooltipPresentInterestState>;
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/**
 * Holds the latest interaction that wants an element's tooltip, while
 * `isEnabled`, until the loaded tooltip reads it. A mouse or pen hover and
 * a :focus-visible focus are held as they come and mount the tooltip. A
 * pointer's focus is not held, as a mounted tooltip does not open on it. A
 * touch or pen press starts the load and mounts nothing: the browser's `click`
 * for it is a tap, which is held and mounts the tooltip, and its
 * `pointercancel` (a scroll) or a key press drops it. A leave or a blur drops
 * a held hover or focus.
 */
export function useDeferredTooltipInterest<T>(
  isEnabled: boolean,
  moduleLoader: ModuleLoader<T>,
): DeferredTooltipInterest<T> {
  const [isWanted, setIsWanted] = useState(false);
  const [loadedModule, setLoadedModule] = useState<T | null>(() =>
    moduleLoader.loaded(),
  );
  // Syncs with the module loader: an enabled tooltip loads its surface, so the
  // first interaction mounts the tooltip at once.
  useEffect(() => {
    if (!isEnabled || loadedModule != null) {
      return;
    }
    let isCurrent = true;
    moduleLoader.load().then(
      loaded => {
        if (isCurrent) {
          setLoadedModule(() => loaded);
        }
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, loadedModule, moduleLoader]);
  const interestRef = useRef<TooltipPresentInterestState>({
    interest: null,
    tapEvent: null,
    isRead: false,
  });
  const stopHoldingPressRef = useRef<(() => void) | null>(null);
  // Releases a held press's listeners on unmount.
  useEffect(() => () => stopHoldingPressRef.current?.(), []);
  // After a failed load, an interaction asks the module loader again. The
  // loader returns its cached module when another element loaded it.
  const load = useCallback(() => {
    moduleLoader.load().then(
      loaded => setLoadedModule(() => loaded),
      () => {},
    );
  }, [moduleLoader]);
  const want = useCallback(() => {
    setIsWanted(true);
    load();
  }, [load]);
  const hold = useCallback(
    (interest: 'hover' | 'focus') => {
      const state = interestRef.current;
      if (!isEnabled || state.isRead) {
        return;
      }
      state.interest = interest;
      state.tapEvent = null;
      want();
    },
    [isEnabled, want],
  );
  const drop = useCallback((interest: 'hover' | 'focus') => {
    const state = interestRef.current;
    if (!state.isRead && state.interest === interest) {
      state.interest = null;
    }
  }, []);
  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch') {
        hold('hover');
      }
    },
    [hold],
  );
  const onPointerLeave = useCallback(() => drop('hover'), [drop]);
  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      stopHoldingPressRef.current?.();
      stopHoldingPressRef.current = null;
      const state = interestRef.current;
      if (!isEnabled || state.isRead) {
        return;
      }
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        // A mouse press cancels a hover show, as a mounted tooltip does.
        drop('hover');
        return;
      }
      // A held hover or focus stays: a pen hovers before it lands, and a
      // finger's press focuses a focusable element before its click. A key
      // press ends the hold, so a keyboard activation's click is not taken
      // for this press's tap.
      stopHoldingPressRef.current = waitForPressClick(
        event.currentTarget,
        click => {
          if (!state.isRead) {
            state.interest = 'tap';
            state.tapEvent = click;
            want();
          }
        },
        {cancelOn: ['keydown']},
      );
      // A press mounts nothing: a scroll would leave a tooltip behind. Its
      // click mounts the tooltip, which answers it as a tap.
      load();
    },
    [isEnabled, drop, load, want],
  );
  // Only a focus that opens a mounted tooltip is held: one that matches
  // :focus-visible. A press focuses a focusable element before its click on
  // some browsers (Chrome on Android); holding that focus would mount the
  // tooltip too late to see the press, and the press's tap would open nothing.
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (
        event.target instanceof Element &&
        event.target.matches(':focus-visible')
      ) {
        hold('focus');
      }
    },
    [hold],
  );
  const onBlur = useCallback(() => drop('focus'), [drop]);
  return {
    isWanted,
    loadedModule,
    interestRef,
    onPointerEnter,
    onPointerLeave,
    onPointerDown,
    onFocus,
    onBlur,
  };
}
