---
'@astryxdesign/core': patch
---

[fix] The chat composer's @-mention and slash-command menu resolves its default "No results" message through the locale catalog, so a translation supplied to `InternationalizationProvider` replaces it. Before, it was a fixed English string. A trigger's own `emptySearchText` still wins.

@nynexman4464
