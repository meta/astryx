// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLocale.ts
 * @input TranslationRuntimeContext (via use())
 * @output The active BCP 47 locale tag
 * @position Public provider-aware locale accessor. Exported from the i18n
 *   barrel for components, sibling packages, and consumers that must thread
 *   the provider locale into pure formatting helpers. Returns `'en'` when
 *   called outside a provider, matching useTranslator/useDirection.
 *
 * This is the approved way to read the locale that feeds a formatting helper
 * (`plainDateFormat`, `formatInstant`, chart formatters, …) or `useCollator()`.
 * Reading `InternationalizationContext` directly for just its `locale` field,
 * or reaching for `navigator.language`/a hardcoded literal, bypasses that
 * provider-backed contract.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/i18n/TranslationRuntimeContext.ts
 * - /packages/core/src/i18n/useLocale.doc.mjs
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/__tests__/useLocale.test.tsx
 */

import {use} from 'react';
import {TranslationRuntimeContext} from './TranslationRuntimeContext';
import type {Locale} from './types';

export function useLocale(): Locale {
  const ctx = use(TranslationRuntimeContext);
  return ctx.locale;
}
