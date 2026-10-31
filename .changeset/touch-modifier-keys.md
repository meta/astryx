---
'@astryxdesign/core': patch
---

[chore] Internal: a gesture touch carries the modifier keys (`ctrlKey`, `metaKey`, `shiftKey`, `altKey`) held when its press began, read from the pointer or touch event, so a group of links can leave a Ctrl-, Cmd- or Shift-click on a member to the browser. Not exported from the package entry point.

@vjeux
