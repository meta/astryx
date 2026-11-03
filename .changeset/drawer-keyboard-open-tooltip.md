---
'@astryxdesign/core': patch
---

[fix] Opening a `Drawer` without its scrim from the keyboard no longer throws an `InvalidStateError` when its first control has a tooltip, such as a `DrawerHeader` close button. The tooltip now opens once the drawer is shown.

@cixzhang @duytbp
