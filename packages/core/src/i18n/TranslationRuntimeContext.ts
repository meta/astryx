// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TranslationRuntimeContext.ts
 * @input React createContext; getResolve
 * @output Exports TranslationRuntimeContext — the locale, direction, catalogs
 *   and the message resolver that the components inside this package read —
 *   and its value type
 * @position Internal to the i18n runtime. The public InternationalizationContext
 *   is this value plus a `translate` bound to the whole English catalog; the
 *   provider writes both. This module imports no catalog, so a component that
 *   reads it (useComponentTranslator, useLocale, useDirection, useCollator)
 *   bundles none; the whole catalog rides only with the public context, the
 *   provider and useTranslator.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/InternationalizationProvider.tsx
 * - /packages/core/src/i18n/useComponentTranslator.ts
 */

import {createContext} from 'react';
import {getResolve} from './resolve';
import type {Locale, MessagesByLocale, Overrides} from './types';

/** Resolves a key against the provider's catalogs, then the caller's English. */
export type MessageResolver = ReturnType<typeof getResolve>;

export interface TranslationRuntimeContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  messages: MessagesByLocale;
  overrides?: Overrides;
  resolve: MessageResolver;
}

export const TranslationRuntimeContext =
  createContext<TranslationRuntimeContextValue>({
    locale: 'en',
    direction: 'ltr',
    messages: {},
    resolve: getResolve('en', {}),
  });
TranslationRuntimeContext.displayName = 'TranslationRuntimeContext';
