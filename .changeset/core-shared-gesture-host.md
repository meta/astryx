---
'@astryxdesign/core': patch
---

[fix] A swizzled component that carries Core's gesture code, such as a swizzled `NavigationStack`, `PageControl` or `TabBar`, now joins the package's gesture host for the document instead of starting a second one, so the copy and package components do not both claim the same touches. No API changes.

@cixzhang
