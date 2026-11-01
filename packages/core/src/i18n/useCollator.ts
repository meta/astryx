// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCollator.ts
 * @input TranslationRuntimeContext (via use()), optional Intl.CollatorOptions
 * @output A memoized Intl.Collator bound to the active locale
 * @position Public provider-aware string-comparison hook. Exported from the
 *   i18n barrel for components, sibling packages, and consumers that need
 *   locale-correct sorting without constructing a raw Intl.Collator. Raw
 *   collator construction stays centralized in this hook.
 *
 * Falls back to `'en'` when called outside a provider, matching the
 * useTranslator/useDirection/useLocale fallback.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/i18n/TranslationRuntimeContext.ts
 * - /packages/core/src/i18n/useLocale.ts
 * - /packages/core/src/i18n/useCollator.doc.mjs
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/__tests__/useCollator.test.tsx
 */

import {use, useMemo} from 'react';
import {TranslationRuntimeContext} from './TranslationRuntimeContext';

/**
 * Returns an `Intl.Collator` for the active provider locale, memoized across
 * renders where the locale and options object are unchanged.
 *
 * @example
 * ```
 * const collator = useCollator({numeric: true});
 * const sorted = [...items].sort((a, b) => collator.compare(a.name, b.name));
 * ```
 */
export function useCollator(options?: Intl.CollatorOptions): Intl.Collator {
  const ctx = use(TranslationRuntimeContext);
  return useMemo(
    () => new Intl.Collator(ctx.locale, options),
    [ctx.locale, options],
  );
}
