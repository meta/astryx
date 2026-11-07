---
'@astryxdesign/core': patch
---

[fix] A closed `Popover`, and any `usePopover` composition, no longer leaves a hidden `role="dialog"` with its label in the DOM. The surface stays mounted but carries the dialog role, name and `aria-modal` only while open, so `[role="dialog"]` selectors and tests that include hidden elements find no dialog that is not on screen. The accessibility tree already omitted the hidden surface. Reopening restores them.

@cixzhang
