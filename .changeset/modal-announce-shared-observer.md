---
'@astryxdesign/core': patch
---

[chore] Internal: the announcement routing inside open modals watches each dialog's `open`, `inert` and `aria-hidden` through Core's shared MutationObserver, so any number of open modals use one observer instead of one each. Routing is unchanged.

@imdreamrunner
