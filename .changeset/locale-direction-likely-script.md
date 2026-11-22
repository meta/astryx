---
'@astryxdesign/core': patch
---

[fix] `getLocaleDirection` reports `rtl` for right-to-left locales in Firefox, which has no `Intl.Locale` text info, by reading the locale's likely script. So does `InternationalizationProvider`'s default direction there. Other engines return the same as before.

@cixzhang
