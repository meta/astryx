// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getLocaleDirection.ts
 * @input BCP 47 locale tag
 * @output 'ltr' | 'rtl'
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
 */

export function getLocaleDirection(locale: string): 'ltr' | 'rtl' {
  try {
    const loc = new Intl.Locale(locale);
    // @ts-expect-error — older engines expose accessor form `.textInfo`
    const info = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo;
    return info?.direction === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}
