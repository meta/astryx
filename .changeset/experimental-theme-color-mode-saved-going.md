---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a color set with no `--mode` in a one-mode theme (`dark-only`) is saved for that mode, as it is built, so setting the theme back to both modes keeps it in its mode instead of painting the other mode with it, and a color saved for the other mode (the half a toast or a lightbox reads) is kept. An undo with no `--mode` removes that color.

@josephfarina
