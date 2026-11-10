---
'@astryxdesign/core': patch
---

[feat] `firstStrongDirection` is exported from `@astryxdesign/core/i18n`, beside `getLocaleDirection`. It reads a string and answers `'ltr'`, `'rtl'`, or `null` when the text carries no strongly directional character, approximating rules P2 and P3 of the Unicode Bidirectional Algorithm from script and category membership, which JavaScript exposes where it exposes no `Bidi_Class` escape. It does not skip isolated runs, and it reads a digit that is Bidi_Class `L` as neutral rather than strong. `Markdown` already classified its blocks with it, and `@astryxdesign/richtext` now shares it rather than carrying a second copy of the tables. It reads no context and is safe on a server.
@potatowagon
