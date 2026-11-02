---
'@astryxdesign/core': patch
---

[fix] Scrolling while a tooltip is open no longer sometimes switches it to the placements it uses to keep clear of its trigger. When a scroll landed just after the trigger moved, the check that keeps a tooltip clear compared the moved trigger with the tooltip's old position, so a tooltip that fits could read as covering its trigger. It then kept those placements until it reopened: if its content grew, it moved beside the trigger instead of flipping below. The check now waits until the tooltip has followed the scroll.

@vjeux
