// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollRegionProps.ts
 * @input Whether a region may scroll, and the caller's role and label
 * @output useScrollRegionProps: a ref for the region, and the role and
 *   accessible name that the region carries while its content overflows
 * @position Internal hook for LayoutContent, LayoutPanel and StackItem.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollRegionProps.test.tsx
 * - /packages/core/src/AppShell/observeMainOverflow.ts
 */

import {useCallback, useState, type AriaRole, type RefCallback} from 'react';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/hooks/useScrollRegionProps.generated';
import {observeMainOverflow} from '../AppShell/observeMainOverflow';

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
}

/**
 * The region's ref, role and accessible name. While the region may scroll
 * and its content overflows, it is a group named by the caller's `label`, or
 * by the translated "Content". A caller's `role` is kept with only the
 * caller's `label`: a single main landmark relies on its role alone. When
 * the region does not scroll, the caller's own `role` and `label` pass
 * through unchanged.
 */
export function useScrollRegionProps({
  isScrollable,
  role,
  label,
}: ScrollRegionOptions): ScrollRegionProps {
  const t = useComponentTranslator();
  const [overflows, setOverflows] = useState(false);
  // A caller's role takes no default name, so its region is not observed.
  const hasRole = role != null;
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (element == null || !isScrollable || hasRole) {
        setOverflows(false);
        return undefined;
      }
      return observeMainOverflow(element, setOverflows);
    },
    [hasRole, isScrollable],
  );
  const isGroup = !hasRole && isScrollable && overflows;
  return {
    ref,
    role: role ?? (isGroup ? 'group' : undefined),
    'aria-label':
      label ?? (isGroup ? t('@astryx.scrollRegion.label') : undefined),
  };
}
