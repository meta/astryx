---
'@astryxdesign/cli': patch
---

[docs] A new `useLocale — Invoice Summary` example block formats an invoice date and amount with `Intl` using the locale from `useLocale`, so switching the provider from English to German changes "Nov 2, 2026 · $1,234.50" to "2. Nov. 2026 · 1.234,50 $" with no second locale source. Copy it with `astryx template useLocaleHookUsage <path>`. (#9511)

@MannXo
