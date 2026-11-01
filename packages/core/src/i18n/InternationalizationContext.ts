// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InternationalizationContext.ts
 * @input React createContext, i18n types, the whole shipped English catalog
 * @output Exports InternationalizationContext and InternationalizationContextValue
 * @position Context definition for client-side locale + messages: the public
 *   context a consumer reads. Its `translate` resolves every `@astryx.*` key,
 *   falling back to the shipped English catalog, so this module carries that
 *   catalog; the locale hooks inside this package read
 *   TranslationRuntimeContext instead, and a component moves to it (carrying
 *   only its own slice) as it adopts useComponentTranslator. Both contexts
 *   are written by InternationalizationProvider, which is how an app
 *   configures Astryx: a value rendered straight into this context reaches
 *   consumers of this context and nothing that reads the runtime context.
 *
 * Separated from InternationalizationProvider.tsx so components can consume
 * the context without pulling in the full provider implementation.
 * Follows the LinkContext.ts / ThemeContext.ts pattern.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationProvider.tsx
 * - /packages/core/src/i18n/TranslationRuntimeContext.ts
 * - /packages/core/src/i18n/useTranslator.ts
 */

import {createContext} from 'react';
import enCatalog from './generated-locales/en.generated';
import type {Locale, MessagesByLocale, Overrides} from './types';
import type {MessageResolver} from './TranslationRuntimeContext';
import {getResolve} from './resolve';

/** A translator over the whole shipped catalog: `translate(key, values?)`. */
export type Translate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

export interface InternationalizationContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  messages: MessagesByLocale;
  overrides?: Overrides;
  /**
   * Resolves a key against the provider's catalogs and overrides, then the
   * whole shipped English catalog.
   */
  translate: Translate;
}

/** Bind the whole English catalog as a resolver's fallback. */
export function translateWithCatalog(resolve: MessageResolver): Translate {
  return (key, values) => resolve(key, values, enCatalog);
}

export const InternationalizationContext =
  createContext<InternationalizationContextValue>({
    locale: 'en',
    direction: 'ltr',
    messages: {},
    translate: translateWithCatalog(getResolve('en', {})),
  });
InternationalizationContext.displayName = 'InternationalizationContext';
