---
'@astryxdesign/core': patch
---

[fix] `ButtonGroup` aligns its role and keyboard model with the APG composite toolbar and group patterns (AST-020 FR15; `component:ButtonGroup` FR1, FR8, AR1, AR2). A group with 3 or more members exposes `role="toolbar"` with `aria-orientation` and roving tabindex (single Tab stop). A group with 2 or fewer members (such as a split button) exposes `role="group"` and keeps every member in the natural Tab order without roving tabindex. An explicit `role` override (`'toolbar'` or `'group'`) is honored.

@Geervan
