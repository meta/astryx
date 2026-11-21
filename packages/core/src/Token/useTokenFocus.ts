// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTokenFocus.ts
 * @input Token availability
 * @output A label ref preserving logical focus across disabled link replacement
 * @position Private Token lifecycle; observes Token-owned content, not router refs
 */

import {useCallback, useRef} from 'react';

export function useTokenFocus(isDisabled: boolean) {
  const previousFocusRef = useRef<{
    disabled: boolean;
    focused: boolean;
  } | null>(null);

  // The label belongs to Token even when a router owns the enabled anchor.
  // Capture focus before removal and hand it to the replacement only when
  // availability changed and no other control has claimed focus.
  return useCallback(
    (node: HTMLElement | null) => {
      if (!node) {
        return;
      }
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      const root = node.closest('.astryx-token');
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
