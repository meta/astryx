---
'@astryxdesign/core': patch
---

[fix] MobileNav keeps its link to MobileNavToggle when a caller passes `id={undefined}`: the dialog keeps AppShell's drawer id, so the toggle's `aria-controls` still names the drawer. A defined `id` still replaces it.

@cixzhang
