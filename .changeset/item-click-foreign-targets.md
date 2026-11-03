---
'@astryxdesign/core': patch
---

[fix] A clickable Item or ListItem (one with `onClick` and no `role`) no longer runs it for a click that belongs to something else: a click inside content the caller portals out of the row with its own `createPortal`, or on a role-based control (`role="tab"`, `"switch"`, `"menuitem"` and the rest of the shared interactive list) nested in the row. (#8977)
@HelloOjasMutreja
