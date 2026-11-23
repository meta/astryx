---
'@astryxdesign/core': patch
---

[fix] A `DropdownMenu` closing on a trigger click now emits `onOpenChange(false)` only once (`spec:AST-009` FR23). Synchronizing controlled open state rollback or close to the popover DOM layer no longer emits a duplicate `onOpenChange(false)` notification.

@rheatkhs
