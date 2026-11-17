// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file disabledInteraction.ts
 * @input An optional caller keydown handler, or a control's caller props
 * @output Event props that keep a focusable, aria-disabled control inert, and
 *   the caller props such a control hands its element
 * @position Shared by controls that replace native `disabled` with
 *   `aria-disabled` under spec:AST-085 (FR1, FR2)
 */

import type {KeyboardEvent, KeyboardEventHandler, MouseEvent} from 'react';

/**
 * Event props for a disabled control that stays focusable. Native `disabled`
 * dispatched no click at all; without it, Enter and Space still synthesize a
 * click that native listeners on the element (a wrapping Popover's trigger)
 * receive. Cancelling those keys keeps the click from existing, and the click
 * handler cancels pointer clicks and keeps them from reaching ancestors. Other
 * keys still reach the caller's handler.
 */
export function disabledInteractionProps<T extends HTMLElement>(
  onKeyDown?: KeyboardEventHandler<T>,
): {
  onClick: (event: MouseEvent<T>) => void;
  onKeyDown: (event: KeyboardEvent<T>) => void;
} {
  return {
    onClick: event => {
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
      } else {
        onKeyDown?.(event);
      }
    },
  };
}

/**
 * The caller props a disabled, focusable control hands its element: every
 * `on*` handler is dropped except focus and blur, so the control runs no
 * caller callback, as a natively disabled one runs none. Enabled, `props` pass
 * through unchanged.
 */
export function withholdCallerHandlers<P extends object>(
  props: P,
  isDisabled: boolean,
): P {
  if (!isDisabled) {
    return props;
  }
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key]) => !/^on[A-Z]/.test(key) || /^on(Focus|Blur)/.test(key),
    ),
  ) as P;
}
