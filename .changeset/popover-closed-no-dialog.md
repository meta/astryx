---
'@astryxdesign/core': patch
---

[fix] A closed `Popover`, and any `usePopover` composition, no longer leaves a hidden `role="dialog"` with its label in the page. The surface stays mounted but carries the dialog role, name and `aria-modal` only while open, so accessibility audits, `[role="dialog"]` queries and "it closed" tests find no dialog that is not on screen. Reopening restores them.

@cixzhang
