// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTranslator.ts
 * @input InternationalizationContext (via use())
 * @output Exports useTranslator hook returning a stable translator function
 * @position Client-side hook for translating outside of render (event handlers,
 *   effects, non-component code) while still resolving against the current
 *   provider's locale.
 *
 * Prefer `t()` for translations at the callsite during render. When you need
 * to translate inside an event handler or effect, capture a translator during
 * render via useTranslator() and call it later.
 *
 * This is the public hook: application code may translate any Astryx key, so
 * loading it registers the whole English catalog. Core components use
 * useComponentTranslator.ts and register only the English they name.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/useComponentTranslator.ts
 */

import {use} from 'react';
import {InternationalizationContext} from './InternationalizationContext';
import {registerFullEnglishFallback} from './fullEnglishFallback';

registerFullEnglishFallback();

export type TranslatorFn = (
  key: string,
  values?: Record<string, unknown>,
) => string;

/**
 * Returns a translator function bound to the current provider's locale.
 * Safe to call from event handlers and effects.
 *
 * @example
 * ```
 * function MyComponent() {
 *   const translate = useTranslator();
 *   const onClick = () => announce(translate('@astryx.pagination.pageAnnounce', {current: 1}));
 * }
 * ```
 */
export function useTranslator(): TranslatorFn {
  const ctx = use(InternationalizationContext);
  return ctx.translate;
}
