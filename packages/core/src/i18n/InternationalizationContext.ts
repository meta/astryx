// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InternationalizationContext.ts
 * @input React createContext, i18n types
 * @output Exports InternationalizationContext and InternationalizationContextValue
 * @position Context definition for client-side locale + messages
 *
 * Separated from InternationalizationProvider.tsx so components can consume
 * the context without pulling in the full provider implementation.
 * Follows the LinkContext.ts / ThemeContext.ts pattern.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationProvider.tsx
 * - /packages/core/src/i18n/t.client.ts
 * - /packages/core/src/i18n/useDirection.ts
 * - /packages/core/src/i18n/useLocale.ts
 * - /packages/core/src/i18n/useCollator.ts
 * - /packages/core/src/i18n/getLocaleDirection.ts
 * - /packages/core/src/i18n/index.ts
 */

import {createContext} from 'react';
import {getResolve} from './resolve';
import type {Locale, MessagesByLocale, Overrides} from './types';
import type {CalendarSystem} from '../utils/calendarSystem';

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
  translate: ReturnType<typeof getResolve>;
}

/**
 * Default value falls through to the shipped English fallback in resolve().
 * A consumer that doesn't render a provider still gets English defaults.
 */
export const InternationalizationContext =
  createContext<InternationalizationContextValue>({
    locale: 'en',
    direction: 'ltr',
    messages: {},
    translate: getResolve('en', {}),
  });
InternationalizationContext.displayName = 'InternationalizationContext';
