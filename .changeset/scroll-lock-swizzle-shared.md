---
'@astryxdesign/core': patch
---

[fix] Two loads of Core's scroll-lock modules on one page now share one page scroll lock: closing the overlay that opened first no longer unlocks the page while the other overlay is still open. Text-selection locks, which a swizzled copy carries, are shared the same way, so a copy's release no longer restores a selection lock the package still holds. No API changes.

@cixzhang
