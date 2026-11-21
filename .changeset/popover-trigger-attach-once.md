---
'@astryxdesign/core': patch
---

[fix] A Popover whose props and trigger stay the same no longer detaches and re-attaches its trigger on re-render. A trigger the caller swaps, remounts or turns into a render function stays attached, and the popover anchors to it.

@cixzhang
