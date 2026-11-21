---
'@astryxdesign/core': patch
---

[fix] A Popover no longer detaches and re-attaches its trigger on every render. It re-attaches only when the trigger, or a prop it wires to the trigger, changes, so a trigger the caller swaps, remounts or turns into a render function stays attached.

@cixzhang
