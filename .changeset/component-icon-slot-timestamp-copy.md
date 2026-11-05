---
'@astryxdesign/core': patch
---

[feat] Timestamp: the hover card's copy button resolves its glyph through the `timestamp-copy` component icon slot with state `{copied}`. With no theme entry it draws `copy`, then `check` while copied, as before. A theme maps it with `defineTheme({componentIcons: {'timestamp-copy': …}})`; `null` hides only the glyph, and the button keeps its name, tooltip, and copy action.

@imdreamrunner
