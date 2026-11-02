---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture recognizers and the menu press model share one guard for the browser's click after a gesture that already acted, swallowing it for 400ms or until the next press. Keyboard and assistive-technology clicks (`detail` 0) always pass.

@vjeux
