---
'@astryxdesign/core': patch
---

[perf] A Button's cut-label tooltip, and the measurement that decides whether its label is cut, now load after the page's first paint instead of with the Button. Pages that render a Button load about 0.2–0.4 KB less JavaScript before first paint. Keyboard focus on a cut label shows it in full as before; a keyboard focus that arrives before the tooltip has loaded shows it once it loads, if focus is still there. Table header cells' cut headings load the same way.

@cixzhang
