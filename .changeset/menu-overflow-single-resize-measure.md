---
'@astryxdesign/core': patch
---

[perf] DropdownMenu: an open menu now measures its overflow once for one viewport change. A width change fires `resize` on the window and on the visual viewport, and the menu read its `scrollHeight` and `clientHeight` for each. The two events now share one frame request, so the menu measures once in the same frame. The menu still sets its scroll class in that frame.

@wbaha
