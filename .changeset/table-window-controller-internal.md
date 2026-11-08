---
'@astryxdesign/core': patch
---

[chore] Internal: Table gains a private window controller and a viewport runtime that read the geometry its scroll owner already measures, and `useScrollableArea` reports whether a measurement followed a content or a layout change. Nothing renders through them yet; apps import nothing new.

@humbertovirtudes
