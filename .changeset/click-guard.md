---
'@astryxdesign/core': patch
---

[fix] The gesture recognizers and the menu press model share one guard for the browser's click after a gesture that already acted. The gesture system now swallows that click for 400ms or until the next press, as menus do, instead of 1000ms. Script-dispatched clicks with a non-zero `detail` are swallowed in that window too; keyboard and assistive-technology clicks (`detail` 0) always pass.

@vjeux
