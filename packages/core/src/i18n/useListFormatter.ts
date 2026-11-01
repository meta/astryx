// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useListFormatter.ts
 * @input InternationalizationContext (via use())
 * @output A memoized function that joins strings as a list in the active locale
 * @position Internal provider-aware list-formatting hook
 *   (architecture:internationalization INV8). Components that show several
 *   catalog messages as one string join them here rather than at the call
 *   site (INV1a). Not exported from the i18n barrel. Raw Intl.ListFormat
 *   construction stays centralized in this hook.
 *
 * Falls back to `'en'` when called outside a provider, matching the
 * useTranslator/useCollator fallback.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/i18n/__tests__/useListFormatter.test.tsx
 * - /internal/eslint-plugin-astryx/no-raw-intl-locale.js
 */

import {use, useMemo} from 'react';
import {InternationalizationContext} from './InternationalizationContext';

/**
 * Returns a function that joins items as a narrow conjunction list (`a, b, c`
 * in English) for the active provider locale, memoized while the locale is
 * unchanged. The narrow conjunction separates items in every shipped locale,
 * including whole sentences, where a unit list runs them together in some
 * (no separator in zh-CN, only a space in ja-JP).
 */
export function useListFormatter(): (items: ReadonlyArray<string>) => string {
  const ctx = use(InternationalizationContext);
  return useMemo(() => {
    const format = new Intl.ListFormat(ctx.locale, {
      type: 'conjunction',
      style: 'narrow',
    });
    return (items: ReadonlyArray<string>) => format.format(items);
  }, [ctx.locale]);
}
