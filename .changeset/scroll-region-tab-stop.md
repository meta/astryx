---
'@astryxdesign/core': patch
---

[fix] A scrolling LayoutContent, LayoutPanel or scrollable StackItem is a Tab stop while its content overflows, so a keyboard user can scroll it with the arrow keys even when it holds no focusable control. Forward Tab into an area whose first control is a link or button goes to that control, so the area adds no stop in front of it. An area that fits adds no stop, and a caller's `tabIndex` wins.

@cixzhang
