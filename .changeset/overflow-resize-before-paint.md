---
'@astryxdesign/core': patch
---

[fix] When an `OverflowList` (or a `useOverflow` host) resizes, it now shows the new visible set in the same frame. Before, the resize rendered after the frame painted, so one frame showed the old set at the new width: items spilled past the edge as the box shrank, or stayed collapsed as it grew. A resize now measures again in a microtask before paint, and every list that one resize reports renders together.

@cixzhang
