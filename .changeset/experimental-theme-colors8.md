---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme an earlier editor built gets its colors right on the first change.

- The color files are brought up to date before the theme is built from them. A font or corner change on such a theme no longer moves its colors, and the next change no longer moves them back.
- `filter` and `backdrop-filter` take only values the browser reads; `filter banana` is refused.
- A font for code alone falls back to a monospace font.

@josephfarina
