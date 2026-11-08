---
'@astryxdesign/core': patch
---

[fix] A swizzled component that carries Core's touch code, such as a swizzled `Switch` or `Slider`, now joins the package's gesture host, window input listeners, click guard, layer input holds and moving-element hit testing for the page instead of keeping a second set, so the copy and package components do not both claim the same touches. No API changes.

@cixzhang
