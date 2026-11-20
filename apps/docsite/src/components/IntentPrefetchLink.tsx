// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file The link that Astryx components render on the docsite: the Next.js
 *   link, with its prefetch held until the visitor shows intent.
 * @input The props of the Next.js link, the link's pointer and focus events,
 *   and the connection's data-saving hints (lib/prefersReducedData.ts).
 * @output A real anchor that navigates on the client. The link downloads its
 *   destination when a mouse or pen pointer or the keyboard focus rests on
 *   it, or at a mouse or pen press. A touch downloads nothing ahead.
 * @position The component that app/providers.tsx gives to LinkProvider.
 */

import NextLink from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent,
} from 'react';
import {prefersReducedData} from '../lib/prefersReducedData';

/**
 * How long the pointer or the keyboard focus stays on a link before the link
 * counts as a likely destination. A pointer that only crosses a link, and a
 * focus that only passes it, leave sooner.
 */
export const INTENT_REST_MS = 100;

/**
 * The Next.js link, which downloads its destination only for a visitor who
 * shows intent: a mouse or pen pointer or the keyboard focus rests on the
 * link for INTENT_REST_MS, or the visitor presses it with a mouse or a pen.
 * A touch shows no intent. A link with intent keeps the Next.js default
 * prefetch. No link shows intent in a data-saving mode or on a 2G connection.
 * A `prefetch` prop from the caller replaces this behavior.
 */
export function IntentPrefetchLink({
  prefetch,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  ...props
}: ComponentProps<typeof NextLink>) {
  const [hasIntent, setHasIntent] = useState(false);
  const restTimer = useRef<number | undefined>(undefined);

  // Stops the rest timer, a browser timer, when the link unmounts.
  useEffect(() => () => window.clearTimeout(restTimer.current), []);

  const showIntent = () => {
    window.clearTimeout(restTimer.current);
    if (!prefersReducedData()) {
      setHasIntent(true);
    }
  };
  const startRest = () => {
    window.clearTimeout(restTimer.current);
    restTimer.current = window.setTimeout(showIntent, INTENT_REST_MS);
  };
  const endRest = () => window.clearTimeout(restTimer.current);
  // A touch press comes too late to help a tap, and a scroll starts with the
  // same press.
  const isTouch = (event: PointerEvent<HTMLAnchorElement>) =>
    event.pointerType === 'touch';

  return (
    <NextLink
      {...props}
      prefetch={prefetch !== undefined ? prefetch : hasIntent ? null : false}
      onPointerEnter={event => {
        onPointerEnter?.(event);
        if (!isTouch(event)) {
          startRest();
        }
      }}
      onPointerLeave={event => {
        onPointerLeave?.(event);
        endRest();
      }}
      onFocus={event => {
        onFocus?.(event);
        // A press moves the focus too. Only keyboard focus comes before the
        // visitor chooses the link.
        if (event.currentTarget.matches(':focus-visible')) {
          startRest();
        }
      }}
      onBlur={event => {
        onBlur?.(event);
        endRest();
      }}
      onPointerDown={event => {
        onPointerDown?.(event);
        if (!isTouch(event)) {
          showIntent();
        }
      }}
    />
  );
}
