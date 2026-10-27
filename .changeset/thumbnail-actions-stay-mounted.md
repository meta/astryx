---
'@astryxdesign/core': patch
---

[fix] Thumbnail: Open and Remove stay mounted while they cannot act. A loading or disabled thumbnail keeps Open, and a disabled one keeps Remove, focusable and announced as disabled instead of removing them, so keyboard focus on an action no longer falls to the page body when the thumbnail starts loading or becomes disabled.

@cixzhang
