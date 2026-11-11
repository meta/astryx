---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] AppShell's guidance on naming its navigation landmarks now says to pass `label` to TopNav and `aria-label` to SideNav. SideNav has no `label` prop; it has a translated default name, and `aria-label` renames it.

@cixzhang
