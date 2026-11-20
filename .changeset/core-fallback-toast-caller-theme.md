---
'@astryxdesign/core': patch
---

[fix] A toast shown from inside a `Theme` with no `LayerProvider` draws under that Theme and its mode, and follows it while the Theme is mounted, so its text reads even when the host page rewrites `<html data-astryx-theme>` (an artifact viewer that themes its own frame). A toast shown with no Theme around it still follows `<html>`. A toast that replaces another by `uniqueID`, one shown with a Theme and the other without, keeps drawing as the first one did, so the card stays in place.

@josephfarina
