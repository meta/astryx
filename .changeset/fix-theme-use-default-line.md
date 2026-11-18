---
'@astryxdesign/cli': patch
---

[fix] `astryx theme use <theme>` opens its receipt with the default it set: "[ok] <theme> is now the app's default theme: themes[defaultThemeSlug] is <theme>.", or "[ok] <theme> was already the app's default theme; nothing changed." when it was the default already. The receipt's fields are unchanged, and the JSON is unchanged.

@josephfarina
