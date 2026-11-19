// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useComponentTranslator.ts
 * @input InternationalizationContext (via use())
 * @output useComponentTranslator, and registerEnglishFallback re-exported for
 *   the same importers
 * @position Internal translator for Core components. Not exported from the
 *   package; application code uses the public `useTranslator`.
 *
 * Returns the same provider-bound translator as the public hook. The public
 * hook also registers the whole English catalog, because application code may
 * translate any Astryx key; a component instead registers the English for the
 * keys it names, from its generated map:
 *
 *   import {
 *     registerEnglishFallback,
 *     useComponentTranslator,
 *   } from '../i18n/useComponentTranslator';
 *   import english from '../i18n/generated-english/Button/Button.generated';
 *
 *   registerEnglishFallback(english);
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/useTranslator.ts
 * - /packages/core/src/i18n/englishFallback.ts
 * - /scripts/i18n-english-fallback.mjs
 */

import {use} from 'react';
import {InternationalizationContext} from './InternationalizationContext';
import type {TranslatorFn} from './useTranslator';

export {registerEnglishFallback} from './englishFallback';

/**
 * Returns the translator bound to the current provider's locale. Keys resolve
 * to English only when the module naming them registered its English.
 */
export function useComponentTranslator(): TranslatorFn {
  const ctx = use(InternationalizationContext);
  return ctx.translate;
}
