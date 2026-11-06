---
'@astryxdesign/core': patch
---

[perf] While a Tooltip is open, the observer that follows its trigger through a scroll no longer reads layout to re-arm. It used to read the trigger's box once or twice and the viewport's size on each frame of a scroll. It now takes them from its own report. The Tooltip still checks its placement once per move, on the same frames as before. (#10235)

@cixzhang
