---
'@astryxdesign/core': patch
---

[fix] reset.css gives the page body the theme's body font (`--font-family-body`, or its default stack when no theme defines it). Text that a library puts straight in the body, such as a hidden span that measures chart axis labels or a tooltip portaled outside the Theme wrapper, no longer falls back to the browser's default serif font.

@josephfarina
