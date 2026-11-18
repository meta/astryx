// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fullEnglishFallback.ts
 * @input The generated English runtime catalog
 * @output registerFullEnglishFallback
 * @position The only Core module that imports the whole English catalog.
 *
 * Called at module scope by the public paths that resolve arbitrary Astryx
 * keys: the public `useTranslator`, the public `InternationalizationContext`
 * export, and PowerSearch operator labels, whose `i18nKey` callers supply.
 * Component modules register only their own keys (englishFallback.ts).
 * scripts/i18n-english-fallback.mjs rejects any other caller.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/englishFallback.ts
 * - /scripts/i18n-english-fallback.mjs
 */

import enCatalog from './generated-locales/en.generated';
import {registerEnglishFallback} from './englishFallback';

/** Make every shipped Astryx key resolve to its English. */
export function registerFullEnglishFallback(): void {
  registerEnglishFallback(enCatalog);
}
