---
'@astryxdesign/core': patch
---

[fix] A `Token` with an `href` now calls a caller's `onClick` (`architecture:public-component-api` INV5, `Token` FR3). Before, `onClick` was dropped whenever `href` made the token a link, so the handler never ran on a click. This covers the link token and the link token with a remove button, where a click on the token surface runs the handler once and a click on the Remove button does not run it. Navigation is unchanged, and calling `preventDefault` in the handler still stops it.

@parinith-web
