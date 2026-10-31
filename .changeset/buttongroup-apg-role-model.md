---
'@astryxdesign/core': patch
---

[fix] `ButtonGroup` updates its role and keyboard interaction model to align with WAI-ARIA APG composite toolbar and group patterns:

- Previous behavior: Every `ButtonGroup` exposed `role="group"` and roving tabindex with a single Tab stop.
- New behavior: A `ButtonGroup` with 3 or more members exposes `role="toolbar"` with `aria-orientation` and roving tabindex (single Tab stop). A group with 2 or fewer members (such as a split button) exposes `role="group"` and keeps every member in the natural Tab order without roving tabindex.
- Adds an optional public `role` override (`'toolbar'` or `'group'`). When nested inside a `Toolbar`, `ButtonGroup` preserves `role="group"` and leaves roving focus to the parent Toolbar so the toolbar retains a single Tab stop.
- Note: This is an accessibility and keyboard interaction model change that updates the behavior previously specified in `component:ButtonGroup` FR1, FR8, AR1, and AR2.

@Geervan
