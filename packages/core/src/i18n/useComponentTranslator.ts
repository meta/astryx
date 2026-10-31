// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useComponentTranslator.ts
 * @input TranslationRuntimeContext (via use()); the component's own English
 *   namespace slice from ./generated-locales/en/<namespace>.generated
 * @output Exports useComponentTranslator — the translator a core component
 *   renders with — and the TranslatorFn type
 * @position The i18n hook for components inside this package. A component
 *   passes the slice of the English catalog that holds its own keys, so a
 *   bundle carries the strings of the components it renders and nothing of
 *   the other hundred. Consumers use useTranslator, which carries the whole
 *   catalog; this hook imports none.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/useTranslator.ts
 * - /packages/core/src/i18n/resolve.ts
 * - /scripts/check-i18n-catalog.mjs (its slice-coverage rule lands with the
 *   component sweep)
 */

import {use, useMemo} from 'react';
import {TranslationRuntimeContext} from './TranslationRuntimeContext';
import type {RuntimeCatalog} from './types';

export type TranslatorFn = (
  key: string,
  values?: Record<string, unknown>,
) => string;

/**
 * Returns a translator bound to the current provider's locale whose English
 * fallback is `messages`: the component's own namespace slice, or a
 * module-level merge of the slices it reads. Stable while the provider and
 * the slice are, so it is safe in memo dependencies, event handlers and
 * effects.
 *
 * @example
 * ```
 * import buttonMessages from '../i18n/generated-locales/en/button.generated';
 *
 * function Button() {
 *   const t = useComponentTranslator(buttonMessages);
 *   return <span>{t('@astryx.button.loading')}</span>;
 * }
 * ```
 */
export function useComponentTranslator(messages: RuntimeCatalog): TranslatorFn {
  const {resolve: resolveMessage} = use(TranslationRuntimeContext);
  return useMemo(
    () => (key: string, values?: Record<string, unknown>) =>
      resolveMessage(key, values, messages),
    [messages, resolveMessage],
  );
}
