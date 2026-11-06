// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCollator.ts
 * @input InternationalizationContext (via use()), optional Intl.CollatorOptions
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
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/useLocale.ts
 * - /packages/core/src/i18n/useCollator.doc.mjs
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/__tests__/useCollator.test.tsx
 */

import {use, useMemo} from 'react';
import {InternationalizationContext} from './InternationalizationContext';

/**
 * Deep-clones collation options to guard against mutations after hook call.
 * Intl.Collator stores a reference to the passed options object; without a
 * defensive copy, mutating the caller's object after the hook returns would
 * silently change comparison behavior until the next locale/options change.
 * The copy is shallow because every option is a primitive or undefined.
 */
function cloneCollatorOptions(
  opts?: Intl.CollatorOptions,
): Intl.CollatorOptions | undefined {
  if (opts == null) {
    return undefined;
  }
  // Every known property is a primitive or undefined; JSON round-trip gives
  // us a frozen, brand-new object with identical values.
  return Object.freeze(JSON.parse(JSON.stringify(opts)));
}

/**
 * Returns an `Intl.Collator` for the active provider locale, memoized across
 * renders where the locale and options object are unchanged.
 *
 * Options are defensively cloned to prevent external mutations from affecting
 * the collator once created. This keeps the hook stable even if callers reuse
 * the same options object across renders.
 *
 * @example
 * ```
 * const collator = useCollator({numeric: true});
 * const sorted = [...items].sort((a, b) => collator.compare(a.name, b.name));
 * ```
 */
export function useCollator(options?: Intl.CollatorOptions): Intl.Collator {
  const ctx = use(InternationalizationContext);
  return useMemo(
    () => new Intl.Collator(ctx.locale, cloneCollatorOptions(options)),
    [ctx.locale, options],
  );
}
