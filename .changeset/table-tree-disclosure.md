---
'@astryxdesign/core': patch
---

[fix] Table tree rows follow the disclosure pattern. Body rows no longer carry `aria-level`, which ARIA allows only in a treegrid; Table has no grid keyboard model, so it keeps table semantics. Each parent row's expand/collapse button keeps `aria-expanded` and its "Expand/Collapse <row>" name, and while expanded it names its child rows with `aria-controls`. Indentation stays visual. No visual change.

@josephfarina
