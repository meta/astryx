---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a doc module given as the theme (`oceanTheme.doc.mjs`, or a file whose default export is a doc such as `{type: 'theme', name, description}`) is refused with `ERR_THEME_LOAD`, naming it as a doc and the theme source beside it to build, and nothing is written.

@josephfarina
