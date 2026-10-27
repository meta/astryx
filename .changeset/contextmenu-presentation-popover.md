---
'@astryxdesign/core': patch
---

[feat] Under a finger, a ContextMenu whose `presentation` is omitted now opens from a held finger on iOS's timeline (the touch model). Pass `presentation="popover"` to keep today's menu on every device: the menu at the pointer, opened by a finger held for 500 ms (the long press). Where the primary pointer is fine (a mouse or trackpad), a finger keeps that same long press.

@vjeux
