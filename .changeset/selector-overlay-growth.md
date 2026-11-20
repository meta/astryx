---
'@astryxdesign/core': patch
---

[fix] When an option grows while a `Selector`'s list is open, and the list is shorter than its height cap, the selected row stays on the trigger. The selected-item overlay measured its place only when the list opened, so a row that grew above the selection left it off the trigger, and a list near the viewport's end grew past it. The overlay now measures again when the open list resizes, before that frame paints. No API changes.

@vjeux
