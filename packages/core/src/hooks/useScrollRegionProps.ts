// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollRegionProps.ts
 * @input Whether a region may scroll, and the caller's role and label
 * @output useScrollRegionProps: a ref for the region, and the role,
 *   accessible name and Tab stop that the region carries while its content
 *   overflows
 * @position Internal hook for LayoutContent, LayoutPanel and StackItem.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollRegionProps.test.tsx
 * - /packages/core/src/AppShell/observeMainOverflow.ts
 */

import {
  useCallback,
  useRef,
  useState,
  type AriaRole,
  type RefCallback,
} from 'react';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/hooks/useScrollRegionProps.generated';
import {observeMainOverflow} from '../AppShell/observeMainOverflow';
import {attachScrollKeyboardDelegation} from './scrollKeyboardDelegation';

registerEnglishFallback(english);

export interface ScrollRegionOptions {
  /** Whether the region may scroll at all (`overflow: auto`). */
  isScrollable: boolean;
  /** The caller's role. It always wins, and takes no default name. */
  role?: AriaRole;
  /** The caller's accessible name. It always wins. */
  label?: string;
}

export interface ScrollRegionProps {
  ref: RefCallback<HTMLElement>;
  role: AriaRole | undefined;
  'aria-label': string | undefined;
  tabIndex: number | undefined;
}

/**
 * The region's ref, role and accessible name. While the region may scroll
 * and its content overflows, it is a group named by the caller's `label`, or
 * by the translated "Content". A caller's `role` is kept with only the
 * caller's `label`: a single main landmark relies on its role alone. When
 * the region does not scroll, the caller's own `role` and `label` pass
 * through unchanged.
 *
 * While it is that group, the region is also a Tab stop, so its overflow
 * scrolls from the keyboard. Forward Tab into a region whose first stop is a
 * native link or button goes to that control instead, as in ScrollableArea,
 * so the region adds no stop in front of it.
 */
export function useScrollRegionProps({
  isScrollable,
  role,
  label,
}: ScrollRegionOptions): ScrollRegionProps {
  const t = useComponentTranslator();
  const [overflows, setOverflows] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  // A caller's role takes no default name, so its region is not observed.
  const hasRole = role != null;
  const ref = useCallback(
    (element: HTMLElement | null) => {
      elementRef.current = element;
      if (element == null || !isScrollable || hasRole) {
        setOverflows(false);
        return undefined;
      }
      let releaseDelegation: (() => void) | undefined;
      const stopObserving = observeMainOverflow(element, nextOverflows => {
        setOverflows(nextOverflows);
        if (nextOverflows) {
          releaseDelegation ??= attachScrollKeyboardDelegation(
            element,
            element,
          );
        } else {
          releaseDelegation?.();
          releaseDelegation = undefined;
        }
      });
      return () => {
        stopObserving();
        releaseDelegation?.();
        elementRef.current = null;
      };
    },
    [hasRole, isScrollable],
  );
  const isGroup = !hasRole && isScrollable && overflows;
  // A region that stops overflowing while it has focus keeps focus: it
  // leaves the Tab order but stays focusable until focus moves on.
  const keepsFocus =
    !isGroup &&
    elementRef.current != null &&
    typeof document !== 'undefined' &&
    document.activeElement === elementRef.current;
  return {
    ref,
    role: role ?? (isGroup ? 'group' : undefined),
    'aria-label':
      label ?? (isGroup ? t('@astryx.scrollRegion.label') : undefined),
    tabIndex: isGroup ? 0 : keepsFocus ? -1 : undefined,
  };
}
