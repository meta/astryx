---
'@astryxdesign/core': patch
---

[perf] The measurement that decides whether a Button's label is cut now loads after the page's first paint, together with its tooltip, instead of with the Button. Pages that render a Button load about 0.2–0.4 KB less JavaScript before first paint. Keyboard focus on a cut label shows it in full as before; a keyboard focus that arrives before the tooltip has loaded shows it once it loads, if focus is still there. Table header cells measure their cut headings the same way.

@cixzhang
