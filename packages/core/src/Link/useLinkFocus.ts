// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLinkFocus.ts
 * @input Link availability
 * @output A content ref preserving logical focus across disabled root replacement
 * @position Private Link focus lifecycle; independent of custom-router refs
 */

import {useCallback, useRef} from 'react';

export function useLinkFocus(isDisabled: boolean) {
  const previousFocusRef = useRef<{
    disabled: boolean;
    focused: boolean;
  } | null>(null);

  // Observe our own content rather than requiring a DOM ref from every router.
  // Ref cleanup runs before removal; attachment hands focus to the replacement
  // only for an availability change, and only if nobody else claimed focus.
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) {
        return;
      }
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      const root = node.closest('.astryx-link');
      const control = node.closest<HTMLElement>(
        'a,button,[role="link"],[role="button"],[tabindex]',
      );
      if (!control || !root?.contains(control)) {
        return;
      }
      const document = node.ownerDocument;
      if (
        previous?.focused &&
        previous.disabled !== isDisabled &&
        control.isConnected &&
        document.activeElement === document.body
      ) {
        control.focus({preventScroll: true});
      }
      return () => {
        previousFocusRef.current = {
          disabled: isDisabled,
          focused: document.activeElement === control,
        };
      };
    },
    [isDisabled],
  );
}
