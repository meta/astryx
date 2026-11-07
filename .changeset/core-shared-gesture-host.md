---
'@astryxdesign/core': patch
---

[fix] A swizzled component that carries Core's touch code, such as a swizzled `NavigationStack`, `PageControl` or `TabBar`, now joins the package's gesture host, window input listeners and click guard for the page instead of starting a second set, so the copy and package components do not both claim the same touches. No API changes.

@cixzhang
