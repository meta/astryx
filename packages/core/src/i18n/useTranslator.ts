// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTranslator.ts
 * @input InternationalizationContext (via use())
 * @output Exports useTranslator hook returning a stable translator function
 * @position Client-side hook for translating outside of render (event handlers,
 *   effects, non-component code) while still resolving against the current
 *   provider's locale. The consumer-facing translator: it resolves every
 *   `@astryx.*` key, so it carries the whole English catalog. A component
 *   inside this package uses useComponentTranslator with its own slice
 *   instead, so an app bundles only the strings of the components it renders.
 *
 * Prefer `t()` for translations at the callsite during render. When you need
 * to translate inside an event handler or effect, capture a translator during
 * render via useTranslator() and call it later.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/index.ts
 * - /packages/core/src/i18n/useComponentTranslator.ts
 */

import {use} from 'react';
import {InternationalizationContext} from './InternationalizationContext';
import type {TranslatorFn} from './useComponentTranslator';

export type {TranslatorFn};

/**
 * Returns a translator function bound to the current provider's locale.
 * Safe to call from event handlers and effects. Its English fallback is the
 * whole shipped catalog, so any `@astryx.*` key resolves.
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
