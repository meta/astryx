// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useListFormatter.ts
 * @input InternationalizationContext (via use()), createListFormatter
 * @output Memoized functions that join strings as a list in the active locale,
 *   as one string or as its parts
 * @position Internal provider-aware list-formatting hook
 *   (architecture:internationalization INV8). Components that show several
 *   catalog messages as one string join them here rather than at the call
 *   site (INV1a). Not exported from the i18n barrel. The shared time helper
 *   (utils/timeFormat.ts) builds its own unit list for compact elapsed
 *   durations.
 *
 * Falls back to `'en'` when called outside a provider, matching the
 * useTranslator/useCollator fallback.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/i18n/__tests__/useListFormatter.test.tsx
 * - /packages/core/src/i18n/listFormat.ts
 */

import {use, useMemo} from 'react';
import {InternationalizationContext} from './InternationalizationContext';
import {
  createListFormatter,
  createListPartsFormatter,
  type ListPart,
} from './listFormat';

/**
 * Returns a function that joins items as a narrow conjunction list (`a, b, c`
 * in English) for the active provider locale, memoized while the locale is
 * unchanged.
 */
export function useListFormatter(): (items: ReadonlyArray<string>) => string {
  const ctx = use(InternationalizationContext);
  return useMemo(() => createListFormatter(ctx.locale), [ctx.locale]);
}

/**
 * The parts form of `useListFormatter`: the list's items and the locale's
 * separators in order, memoized while the locale is unchanged.
 */
export function useListPartsFormatter(): (
  items: ReadonlyArray<string>,
) => ReadonlyArray<ListPart> {
  const ctx = use(InternationalizationContext);
  return useMemo(() => createListPartsFormatter(ctx.locale), [ctx.locale]);
}
