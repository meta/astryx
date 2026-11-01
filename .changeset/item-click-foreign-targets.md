---
'@astryxdesign/core': patch
---

[fix] A clickable Item, ListItem or other row with `onClick` no longer runs it for a click that belongs to something else: a click inside a portal rendered from the row (a MoreMenu's menu in `endContent`), or on a role-based control (`role="tab"`, `"switch"`, `"menuitem"` and the rest of the shared interactive list) nested in the row. (#8977)
@HelloOjasMutreja
