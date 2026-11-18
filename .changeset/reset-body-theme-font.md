---
'@astryxdesign/core': patch
---

[fix] reset.css gives the page the `--font-family-body` font, so text in the page body outside the Theme wrapper, such as a tooltip or a hidden span a chart uses to measure labels, no longer falls back to the browser's serif font. A page where no stylesheet defines the token keeps its current font.

@josephfarina
