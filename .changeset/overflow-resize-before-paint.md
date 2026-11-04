---
'@astryxdesign/core': patch
---

[fix] When an `OverflowList` (or a `useOverflow` host) resizes, it now shows the new visible set in the same frame. Before, the resize rendered after the frame painted, so one frame showed the old set at the new width: items spilled past the edge as the box shrank, or stayed collapsed as it grew. A resize now measures again in a microtask before paint, every list that one resize reports renders together, and a resize that changes nothing renders nothing. A resize that changes the folded set can make Chromium report "ResizeObserver loop completed with undelivered notifications" once in that frame, when the list's own height changes with it (several rows) or another observer watches an outer element; no notification is lost, and an error monitor should ignore this message.

@cixzhang
