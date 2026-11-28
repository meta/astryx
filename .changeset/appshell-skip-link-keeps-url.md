---
'@astryxdesign/core': patch
---

[fix] AppShell's skip link moves focus to the main region and leaves the URL alone. It no longer sets the page's hash, so an app that keeps its routes in the hash stays on its page. The link keeps its `href` for a page without script.

@inesgomas
