---
'@astryxdesign/core': patch
---

[chore] Internal: the focus hand-off Core runs when it replaces one of a control's elements ignores an element while it is inside an inert region, such as the copy OverflowList renders to measure its items, and Core's internal `@astryxdesign/core/internal/touch` entry re-exports it for Astryx's own packages, so Lab's Comments carries focus from Mark as resolved to Reopen and back. It is not part of the public API. Apps see no change.

@ernestt
