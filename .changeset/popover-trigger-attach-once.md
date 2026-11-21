---
'@astryxdesign/core': patch
---

[fix] A Popover whose props and trigger stay the same no longer detaches and re-attaches its trigger, or sets state, on re-render. A trigger the caller swaps or remounts is still attached, and a sheet with no `label` still follows its trigger's text.

@cixzhang
