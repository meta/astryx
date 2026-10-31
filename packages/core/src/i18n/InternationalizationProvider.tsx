// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InternationalizationProvider.tsx
 * @input React, InternationalizationContext, TranslationRuntimeContext, i18n types
 * @output Exports InternationalizationProvider component and props type
 * @position Provider component for astryx i18n locale + messages
 *
 * Wraps a subtree with a locale and (optional) additional message catalogs +
 * overrides. Astryx components inside the subtree resolve their strings via
 * this context. If a consumer never renders a provider, astryx components
 * still work — they use the shipped en catalog directly.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/InternationalizationProvider.doc.mjs
 */

import {useMemo, type ReactNode} from 'react';
import {
  InternationalizationContext,
  translateWithCatalog,
} from './InternationalizationContext';
import {TranslationRuntimeContext} from './TranslationRuntimeContext';
import {getLocaleDirection} from './getLocaleDirection';
import type {
  Locale,
  MessagesByLocale,
  Overrides,
  ProviderMessagesByLocale,
} from './types';
import {getResolve} from './resolve';

function normalizeMessages(
  messages: ProviderMessagesByLocale,
): MessagesByLocale {
  const hasRuntimeCatalog = Object.values(messages).some(catalog =>
    Object.values(catalog).some(entry => typeof entry === 'string'),
  );
  if (!hasRuntimeCatalog) {
    return messages as MessagesByLocale;
  }

  return Object.fromEntries(
    Object.entries(messages).map(([locale, catalog]) => [
      locale,
      Object.fromEntries(
        Object.entries(catalog).map(([key, entry]) => [
          key,
          typeof entry === 'string' ? {defaultMessage: entry} : entry,
        ]),
      ),
    ]),
  );
}

export interface InternationalizationProviderProps {
  /**
   * BCP 47 language tag. Examples: `'en'`, `'pt'`, `'pt-BR'`, `'zh-Hans'`.
   *
   * Regional tags are respected — resolving a message walks the tag from
   * most-specific to least-specific (`pt-BR` → `pt`), then falls back to
   * the shipped `en` catalog.
   */
  locale: Locale;
  /**
   * Additional shipped catalogs to make available for the selected locale.
   * `en` is bundled with astryx and never needs to be listed here.
   *
   * @example
   * ```
   * import frFR from '@astryxdesign/core/locales/fr-FR.generated.js';
   * <InternationalizationProvider
   *   locale="fr-FR"
   *   messages={{'fr-FR': frFR}}>
   * ```
   */
  messages?: ProviderMessagesByLocale;
  /**
   * Sparse per-locale overrides applied on top of shipped defaults.
   * Only the keys you want to override need to be listed.
   *
   * @example
   * ```
   * <InternationalizationProvider
   *   locale="fr"
   *   overrides={{fr: {'@astryx.pagination.next': 'Suivant'}}}>
   * ```
   */
  overrides?: Overrides;
  /**
   * Optional explicit text direction override. When omitted, direction is derived
   * from `locale` via `Intl.Locale.getTextInfo()`. Provide this to force a
   * direction (e.g. RTL layout testing under an English catalog) or to skip the
   * derivation when you already know the direction.
   *
   * This sets the direction astryx reads via context; it does NOT set the DOM
   * `dir` attribute. You must set `dir` on `<html>` (or a wrapping element)
   * yourself — astryx components mirror layout and directional icons from the
   * DOM `dir`, so an RTL locale won't visually mirror without it. Keep the two
   * in sync (e.g. `dir={getLocaleDirection(locale)}` on both).
   */
  dir?: 'ltr' | 'rtl';
  children: ReactNode;
}

/**
 * Provides locale + additional messages + overrides to all astryx
 * components in the subtree.
 */
export function InternationalizationProvider({
  locale,
  messages,
  overrides,
  dir,
  children,
}: InternationalizationProviderProps) {
  const direction = dir ?? getLocaleDirection(locale);
  // One resolver, two readers: the components inside this package pass their
  // own English slice to it; the public context binds the whole catalog.
  const runtime = useMemo(() => {
    const providedMessages = messages ?? {};
    return {
      locale,
      direction,
      messages: normalizeMessages(providedMessages),
      overrides,
      resolve: getResolve(locale, providedMessages, overrides),
    };
  }, [locale, direction, messages, overrides]);
  const value = useMemo(
    () => ({
      locale: runtime.locale,
      direction: runtime.direction,
      messages: runtime.messages,
      overrides: runtime.overrides,
      translate: translateWithCatalog(runtime.resolve),
    }),
    [runtime],
  );
  return (
    <TranslationRuntimeContext value={runtime}>
      <InternationalizationContext value={value}>
        {children}
      </InternationalizationContext>
    </TranslationRuntimeContext>
  );
}

InternationalizationProvider.displayName = 'InternationalizationProvider';
