---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: an exact token hand-edited in the settings file to a `var()` that names no design token (and has no fallback) is named by `show` and every later command, with the `undo` that removes it, as `set` refuses it; it is never built. The `font` dial reads any run of spaces or tabs inside a family name as one space, so `font 'Open  Sans'` names Open Sans.

@josephfarina
