// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InternationalizationContext.ts
 * @input createSharedContext, defaultTranslator, i18n types
 * @output Exports InternationalizationContext and InternationalizationContextValue
 * @position Context definition for client-side locale + messages
 *
 * Separated from InternationalizationProvider.tsx so components can consume
 * the context without pulling in the full provider implementation.
 * Follows the LinkContext.ts / ThemeContext.ts pattern. It does not import the
 * resolver, so a module that only reads the locale skips the message parser.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationProvider.tsx
 * - /packages/core/src/i18n/t.client.ts
 * - /packages/core/src/i18n/useDirection.ts
 * - /packages/core/src/i18n/useLocale.ts
 * - /packages/core/src/i18n/useCollator.ts
 * - /packages/core/src/i18n/getLocaleDirection.ts
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/defaultTranslator.ts
 * - /packages/core/src/i18n/translatingContext.ts
 */

import type {getResolve} from './resolve';
import type {Locale, MessagesByLocale, Overrides} from './types';
import type {CalendarSystem} from '../utils/calendarSystem';
import {createSharedContext} from '../utils/sharedContext';
import {defaultTranslator} from './defaultTranslator';

type Translate = ReturnType<typeof getResolve>;

export interface InternationalizationContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  /**
   * The provider's requested calendar system. A context without it means
   * Gregorian dates.
   */
  calendar?: CalendarSystem;
  messages: MessagesByLocale;
  overrides?: Overrides;
  translate: Translate;
}

/**
 * Without a provider, `translate` resolves shipped English through the
 * translator that translatingContext.ts registers when a translating module
 * loads it. It returns the key only when no such module
 * has loaded, which no translating path can reach.
 */
export const InternationalizationContext =
  createSharedContext<InternationalizationContextValue>(
    'InternationalizationContext',
    1,
    {
      locale: 'en',
      direction: 'ltr',
      messages: {},
      translate: (key, values) =>
        defaultTranslator.translate?.(key, values) ?? key,
    },
  );
InternationalizationContext.displayName = 'InternationalizationContext';
