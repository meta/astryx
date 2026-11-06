// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file englishFallback.ts
 * @input English key-to-message maps registered at module scope by the Core
 *   modules that name those keys
 * @output registerEnglishFallback and the read-only englishFallback map
 * @position The shipped English fallback resolve.ts reads after the locale
 *   chain.
 *
 * A Core module that names catalog keys registers the English for exactly
 * those keys from its generated map (`i18n/generated-english/`, derived by
 * scripts/generate-i18n-runtime.mjs):
 *
 *   import english from '../i18n/generated-english/Button/Button.generated';
 *   registerEnglishFallback(english);
 *
 * so a component carries the English it can show rather than the whole
 * catalog. Registration runs when the module loads, before any of its code
 * can look a key up, so a key resolves wherever the module naming it is
 * loaded. Public paths that resolve arbitrary Astryx keys register the whole
 * catalog through fullEnglishFallback.ts.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/resolve.ts
 * - /packages/core/src/i18n/fullEnglishFallback.ts
 * - /scripts/i18n-english-fallback.mjs
 */

import type {RuntimeCatalog} from './types';

const registered: Record<string, string> = {};

/** The English registered so far, keyed by catalog key. */
export const englishFallback: RuntimeCatalog = registered;

/** Add a module's English to the shipped fallback. */
export function registerEnglishFallback(messages: RuntimeCatalog): void {
  Object.assign(registered, messages);
}
