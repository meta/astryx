---
'@astryxdesign/core': patch
---

[fix] A toast shown from inside a `Theme` with no `LayerProvider` draws under that Theme and its mode, so its text reads even when the host page rewrites `<html data-astryx-theme>` (an artifact viewer that themes its own frame). A toast shown with no Theme around it still follows `<html>`.

@josephfarina
