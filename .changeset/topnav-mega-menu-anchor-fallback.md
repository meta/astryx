---
'@astryxdesign/core': patch
---

[fix] `TopNavMegaMenu`'s panel no longer falls back to the viewport's top-left corner when the component is rendered without an ancestor `<nav>` element (e.g. an isolated docs/storybook preview). It anchors to the nearest ancestor `<nav>` when one exists (unchanged, the panel stays full-width against the nav bar), and now falls back to the trigger button itself when it doesn't, instead of never setting an anchor at all.

@HelloOjasMutreja
