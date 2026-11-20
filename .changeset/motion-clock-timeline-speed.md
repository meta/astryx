---
'@astryxdesign/core': patch
---

[fix] While DevTools slows the page's animations, reading or stopping an animation gives the value on screen. A stop holds the element in place instead of jumping it ahead. The motion clock follows the document timeline's own time. At full speed nothing changes.

@vjeux
