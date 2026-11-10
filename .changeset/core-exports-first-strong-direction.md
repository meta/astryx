---
'@astryxdesign/core': patch
---

[feat] `firstStrongDirection` is exported from `@astryxdesign/core/i18n`, beside `getLocaleDirection`. It reads a string and answers `'ltr'`, `'rtl'`, or `null` when the text carries no strongly directional character, following rules P2 and P3 of the Unicode Bidirectional Algorithm. `Markdown` already classified its blocks with it, and `@astryxdesign/richtext` now shares it rather than carrying a second copy of the tables. It reads no context and is safe on a server.
@potatowagon
