// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolve.ts
 * @input Key + values + locale + catalog + overrides
 * @output Formatted message string
 * @position Shared lookup + ICU formatting core, used by useTranslator().
 *
 * Lookup order:
 *   1. Per-locale override for the exact locale
 *   2. Per-locale override for a parent locale (pt-BR → pt)
 *   3. Shipped catalog entry for the exact locale
 *   4. Shipped catalog entry for a parent locale (pt-BR → pt)
 *   5. The caller's English fallback (the source of truth): a component's own
 *      namespace slice through useComponentTranslator, or the whole shipped en
 *      catalog through useTranslator. This module imports no catalog itself,
 *      so a bundle carries only the slices of the components it renders.
 *   6. The key itself (dev-visible fallback, warns once)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/useComponentTranslator.ts
 * - /packages/core/src/i18n/useTranslator.ts
 * - /packages/core/src/i18n/__tests__/resolve.test.ts
 */

import IntlMessageFormat from 'intl-messageformat';
import type {
  Locale,
  Overrides,
  ProviderMessagesByLocale,
  RuntimeCatalog,
} from './types';
import {warnOnce, __resetDevWarnings} from '../utils/devWarning';

/**
 * Cache of parsed ICU MessageFormat objects keyed by `${locale}::${message}`.
 * IntlMessageFormat parsing is non-trivial; caching avoids reparsing on every
 * render. The cache is unbounded in principle but bounded in practice by the
 * static set of astryx keys.
 */
const formatterCache = new Map<string, IntlMessageFormat>();

function getFormatter(message: string, locale: Locale): IntlMessageFormat {
  const cacheKey = `${locale}::${message}`;
  let f = formatterCache.get(cacheKey);
  if (f === undefined) {
    f = new IntlMessageFormat(message, locale);
    formatterCache.set(cacheKey, f);
  }
  return f;
}

/**
 * Walk a BCP 47 tag from most-specific to least-specific.
 * Input is canonicalized via `Intl.Locale.baseName` so `pt-br` and `PT-BR`
 * both produce `['pt-BR', 'pt']`.
 *
 * Examples:
 *   'pt-BR'      → ['pt-BR', 'pt']
 *   'zh-Hans-CN' → ['zh-Hans-CN', 'zh-Hans', 'zh']
 *   'en'         → ['en']
 *
 * `en` is intentionally NOT appended here — the caller falls back to the
 * shipped en catalog separately as the final source-of-truth.
 */
export function resolveLocaleChain(locale: Locale): Locale[] {
  let canonical: string;
  try {
    canonical = new Intl.Locale(locale).baseName;
  } catch {
    // Malformed input — fall back to the raw string so callers still get a chain.
    canonical = locale;
  }
  const parts = canonical.split('-');
  const chain: Locale[] = [];
  for (let i = parts.length; i > 0; i--) {
    chain.push(parts.slice(0, i).join('-'));
  }
  return chain;
}

function getLookup(
  locale: Locale,
  messages: ProviderMessagesByLocale,
  overrides?: Overrides,
): Record<string, string> {
  const lookup: Record<string, string> = {};
  const chain = resolveLocaleChain(locale);
  // 1 + 2. Overrides (most specific to least specific in the chain)
  if (overrides !== undefined) {
    for (const tag of chain) {
      if (overrides[tag]) {
        for (const [key, value] of Object.entries(overrides[tag])) {
          if (lookup[key] === undefined && value !== null) {
            lookup[key] = value;
          }
        }
      }
    }
  }
  for (const tag of chain) {
    if (messages[tag]) {
      for (const [key, value] of Object.entries(messages[tag])) {
        const message =
          typeof value === 'string' ? value : value?.defaultMessage;
        if (lookup[key] === undefined && message != null) {
          lookup[key] = message;
        }
      }
    }
  }

  return lookup;
}

export function getResolve(
  locale: Locale,
  messages: ProviderMessagesByLocale,
  overrides?: Overrides,
) {
  const lookup = getLookup(locale, messages, overrides);

  return (
    key: string,
    values: Record<string, unknown> | undefined,
    fallback?: RuntimeCatalog,
  ) => {
    const result = lookup[key] ?? fallback?.[key];
    if (result === undefined) {
      // Fires ONLY when a key is missing from every source including the
      // caller's English fallback — a real bug (typo, stale catalog, deleted
      // key, or a component reading a key outside its own namespace slice;
      // `check:i18n-catalog`'s slice-coverage rule, which lands with the
      // component sweep, catches the last one before it ships).
      // Fallback to `en` from a non-en locale is expected and stays silent,
      // matching the FormatJS / i18next default.
      warnOnce(
        `astryx-i18n:${locale}::${key}`,
        'astryx-i18n',
        `missing key: ${key} (locale: ${locale})`,
      );
      return key;
    }

    if (values === undefined) {
      // Static string — skip the parser entirely for the common case
      return result;
    }

    const formatted = getFormatter(result, locale).format(values);
    // IntlMessageFormat.format returns string | (string | React elements) — we
    // only ever pass string values so it will be a string; assert for the type
    // system.
    return formatted as string;
  };
}

/**
 * Reset internal caches. Test-only.
 * @internal
 */
export function __resetForTests(): void {
  formatterCache.clear();
  __resetDevWarnings();
}
