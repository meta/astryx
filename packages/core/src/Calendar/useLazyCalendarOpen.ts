// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLazyCalendarOpen.ts
 * @input A date field's element, whether it is disabled, and its popover's
 *   show call
 * @output useLazyCalendarOpen: an open call that shows the popover at once
 *   when Calendar has loaded and holds the open until the load otherwise, and
 *   the field element's handlers that start the load on intent and drop a
 *   held open
 * @position Internal hook for a date field whose popover holds a
 *   LazyCalendar
 */

import {useCallback, useRef, type RefObject} from 'react';
import type React from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {useOutsidePress} from '../Layer/outsidePress';
import {isShadowRoot} from '../utils/nodeType';
import {isCalendarLoaded, loadCalendar} from './LazyCalendar';

export interface LazyCalendarFieldProps {
  onPointerEnter: (event: React.PointerEvent) => void;
  onPointerDown: () => void;
  onFocus: () => void;
  onBlur: (event: React.FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export interface LazyCalendarOpen<Options> {
  /** Shows the popover, or holds the open until Calendar loads. */
  open: (options?: Options) => void;
  /** Handlers for the field element that wraps the input and its trigger. */
  fieldProps: LazyCalendarFieldProps;
}

/**
 * An open asked for before Calendar loads opens once it loads, and a failed
 * load drops it. The popover never shows without Calendar. While the open is
 * held, the trigger still reads as closed, so another press is another open
 * intent and keeps the hold. A press outside the field, focus moving to
 * another element, Escape, or the field becoming disabled drops the hold, as
 * Selector's held sheet open does. No popover then appears later, over what
 * the person turned to.
 */
export function useLazyCalendarOpen<Options>({
  fieldRef,
  isDisabled,
  show,
}: {
  fieldRef: RefObject<HTMLElement | null>;
  isDisabled: boolean;
  show: (options?: Options) => void;
}): LazyCalendarOpen<Options> {
  const heldOptionsRef = useRef<{options: Options | undefined} | null>(null);
  const heldPressWatch = useOutsidePress();
  const showRef = useCommittedRef(show);
  const isDisabledRef = useCommittedRef(isDisabled);

  const dropHeldOpen = useCallback(() => {
    heldOptionsRef.current = null;
    heldPressWatch.stop();
  }, [heldPressWatch]);

  const holdOpenUntilLoaded = useCallback(
    (options: Options | undefined) => {
      if (heldOptionsRef.current != null) {
        return;
      }
      heldOptionsRef.current = {options};
      const field = fieldRef.current;
      if (field != null) {
        const root = field.getRootNode();
        heldPressWatch.start(
          field,
          path => path.includes(field),
          dropHeldOpen,
          {
            root: isShadowRoot(root) ? root : null,
            // The drop closes no layer, so a backdrop press still closes its
            // host.
            isDismissal: false,
          },
        );
      }
      void loadCalendar().then(isLoaded => {
        const held = heldOptionsRef.current;
        if (held == null) {
          return;
        }
        dropHeldOpen();
        // An unmounted or now disabled field opens nothing.
        if (
          isLoaded &&
          !isDisabledRef.current &&
          fieldRef.current?.isConnected === true
        ) {
          showRef.current(held.options);
        }
      });
    },
    [dropHeldOpen, fieldRef, heldPressWatch, isDisabledRef, showRef],
  );

  const open = useCallback(
    (options?: Options) => {
      if (isCalendarLoaded()) {
        showRef.current(options);
      } else {
        holdOpenUntilLoaded(options);
      }
    },
    [holdOpenUntilLoaded, showRef],
  );

  // The field's intent (a mouse or pen entry, a focus or a press) starts
  // loading Calendar, so an open that follows finds it loaded.
  const preload = useCallback(() => {
    void loadCalendar();
  }, []);
  const onPointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') {
        preload();
      }
    },
    [preload],
  );
  const onBlur = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget;
      if (
        heldOptionsRef.current != null &&
        next instanceof Node &&
        !event.currentTarget.contains(next)
      ) {
        dropHeldOpen();
      }
    },
    [dropHeldOpen],
  );
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape' && heldOptionsRef.current != null) {
        dropHeldOpen();
      }
    },
    [dropHeldOpen],
  );

  return {
    open,
    fieldProps: {
      onPointerEnter,
      onPointerDown: preload,
      onFocus: preload,
      onBlur,
      onKeyDown,
    },
  };
}
