---
'@astryxdesign/core': patch
---

[perf] DropdownMenu: an open menu now measures its overflow once, not twice, when one viewport change fires `resize` on both the window and the visual viewport. The two events now share one frame request. The scroll class updates as before.

@wbaha
