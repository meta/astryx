---
'@astryxdesign/theme-neutral': patch
---

[perf] Neutral: `fonts.css` loads Figtree with `@font-face` rules instead of a stylesheet `@import`, so the page's first paint no longer waits for the font service, and a slow or unreachable font host no longer keeps the page blank. Until Figtree arrives, text draws in a fallback face: the device's Arial, Liberation Sans or Arimo sized to Figtree's metrics, so the swap moves the layout less. Without `fonts.css`, the theme still falls back to the system font stack.

@cixzhang
