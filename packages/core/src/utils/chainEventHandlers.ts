// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file chainEventHandlers.ts
 * @input Multiple React event handlers (or undefined)
 * @output A single handler that calls every handler in order
 * @position Utility; used where a component's own handler and a consumer
 *   handler share one element and the consumer must observe every event the
 *   component handled, as it did when the consumer's handler sat on an
 *   ancestor and received the event by bubbling.
 *
 * Unlike `composeEventHandlers`, `event.preventDefault()` in an earlier handler
 * does not skip later ones: the component's handler runs first and cannot hide
 * the event from the consumer, and the consumer cannot cancel the component's
 * behavior.
 */

import type {SyntheticEvent} from 'react';

/**
 * Chain event handlers into one. Every handler runs, in argument order.
 *
 * @example
 * ```
 * <input onKeyDown={chainEventHandlers(handleKeyDown, onKeyDownProp)} />
 * ```
 */
export function chainEventHandlers<E extends SyntheticEvent>(
  ...handlers: (((event: E) => void) | undefined)[]
): (event: E) => void {
  return (event: E) => {
    for (const handler of handlers) {
      handler?.(event);
    }
  };
}
