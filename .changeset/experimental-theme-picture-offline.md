---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` pictures (`--png`) never wait on a network: the picture's browser loads the page's own files only, so a remote stylesheet, font or image a page names (a base theme's Google Fonts import, a template's photo) fails at once instead of holding the picture until the time limit when the machine is offline or has no direct internet.

@josephfarina
