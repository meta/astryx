---
'@astryxdesign/cli': patch
---

[fix] `astryx build` names a page template that is not ready only when the idea names it, as a reason ("`incident-console` isn't ready yet, so build started from `shell-top-nav`."); otherwise no not-ready template appears in its output, including `pages` and the "Keyword search matched" line.

@josephfarina
