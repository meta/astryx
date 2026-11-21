// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getLocaleDirection.ts
 * @input BCP 47 locale tag
 * @output 'ltr' | 'rtl'
 * @position Server-safe helper for computing text direction from a locale.
 *   Callable in React Server Components / Next.js layouts to set <html dir>.
 *
 * Uses Intl.Locale.getTextInfo() (CLDR-backed), or the older accessor form
 * (`.textInfo`). An engine with neither takes the locale's likely script. A
 * tag that does not parse gives 'ltr'.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationProvider.tsx (uses this to derive default)
 * - /packages/core/src/i18n/useDirection.ts (client-side hook counterpart)
 * - /packages/core/src/i18n/index.ts (public export)
 */

// The scripts CLDR writes right to left. Some engines (Firefox) have no
// `Intl.Locale` text info, so a locale's likely script decides there, and the
// server and the browser give the same direction.
const RIGHT_TO_LEFT_SCRIPTS = new Set([
  'Adlm',
  'Arab',
  'Hebr',
  'Mand',
  'Mend',
  'Nkoo',
  'Rohg',
  'Samr',
  'Syrc',
  'Thaa',
  'Yezi',
]);

export function getLocaleDirection(locale: string): 'ltr' | 'rtl' {
  try {
    // Older engines expose the accessor form `.textInfo`.
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getTextInfo?: () => {direction?: string};
      textInfo?: {direction?: string};
    };
    const direction = (loc.getTextInfo?.() ?? loc.textInfo)?.direction;
    if (direction === 'rtl' || direction === 'ltr') {
      return direction;
    }
    const {script} = loc.maximize();
    return script != null && RIGHT_TO_LEFT_SCRIPTS.has(script) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}
