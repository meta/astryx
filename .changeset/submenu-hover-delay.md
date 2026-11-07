---
'@astryxdesign/core': patch
---

[feat] `DropdownMenuSubMenu` accepts `delay` and `hideDelay`, in milliseconds, the same options `Tooltip`, `HoverCard` and `TopNavMenu` have. `delay` is how long a hovering pointer waits before the flyout opens (default 150), and `hideDelay` is how long the flyout stays after the pointer leaves (default 200). The defaults match today's timing, so nothing changes unless you pass them. Keyboard focus and touch never wait.

@cixzhang
