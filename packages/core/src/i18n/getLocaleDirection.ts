// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getLocaleDirection.ts
 * @input BCP 47 locale tag
 * @output getLocaleDirection: 'ltr' | 'rtl'. readLocaleDirection: the same,
 *   or null when the engine cannot tell
 * @position Server-safe helper for computing text direction from a locale.
 *   Callable in React Server Components / Next.js layouts to set <html dir>.
 *
 * Uses Intl.Locale.getTextInfo() (CLDR-backed) with a try/catch fallback to
 * 'ltr'. React 19 baseline covers all target browsers + Node ≥20; the older
 * accessor form (`.textInfo`) is handled as a fallback for defensive parity.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationProvider.tsx (uses this to derive default)
 * - /packages/core/src/i18n/useDirection.ts (client-side hook counterpart)
 * - /packages/core/src/i18n/index.ts (public export)
 * - /packages/core/src/utils/localeTextDirection.ts (formatted time and date text)
 */

/**
 * The direction CLDR gives the locale's script, or null when the engine
 * cannot tell or the tag does not parse.
 */
export function readLocaleDirection(locale: string): 'ltr' | 'rtl' | null {
  try {
    // Older engines expose the accessor form `.textInfo`.
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => {direction?: string};
      textInfo?: {direction?: string};
    };
    const info = loc.getTextInfo?.() ?? loc.textInfo;
    const direction: unknown = info?.direction;
    return direction === 'rtl' || direction === 'ltr' ? direction : null;
  } catch {
    return null;
  }
}

export function getLocaleDirection(locale: string): 'ltr' | 'rtl' {
  return readLocaleDirection(locale) ?? 'ltr';
}
