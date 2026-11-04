// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from InternationalizationProvider, InternationalizationContext,
 *   useTranslator, translator, types
 * @output Public surface for the i18n subpackage
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * The public API is deliberately small:
 *   - InternationalizationProvider — provider component
 *   - useTranslator               — hook returning a translator function
 *   - useLocale                   — hook returning the provider locale
 *   - useCollator                 — provider-bound locale-aware comparison
 *   - useDirection                — hook returning the ambient text direction
 *   - getLocaleDirection          — server-safe locale → direction helper
 *   - Translator                  — interface for consumer-injected runtimes
 *
 * `useTranslator` and `InternationalizationContext` are the public paths
 * that resolve any Astryx key, so they register the whole English catalog.
 * Core modules import the defining modules (useComponentTranslator.ts,
 * InternationalizationContext.ts) instead of this barrel for those two.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/index.ts
 * - /packages/core/src/i18n/useLocale.ts
 * - /packages/core/src/i18n/useCollator.ts
 * - /packages/core/src/i18n/useDirection.ts
 * - /packages/core/src/i18n/getLocaleDirection.ts
 */

export {InternationalizationProvider} from './InternationalizationProvider';
export type {InternationalizationProviderProps} from './InternationalizationProvider';
export {InternationalizationContext} from './publicContext';
export type {InternationalizationContextValue} from './InternationalizationContext';
export {useTranslator} from './useTranslator';
export type {TranslatorFn} from './useTranslator';
export {useLocale} from './useLocale';
export {useCollator} from './useCollator';
export {useDirection} from './useDirection';
export {getLocaleDirection} from './getLocaleDirection';
export type {Translator} from './translator';
export type {
  Locale,
  Catalog,
  MessageEntry,
  RuntimeCatalog,
  MessagesByLocale,
  ProviderMessagesByLocale,
  Overrides,
} from './types';
