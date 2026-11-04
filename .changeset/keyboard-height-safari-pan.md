---
'@astryxdesign/core': patch
---

[fix] The on-screen keyboard's height reads the whole keyboard while Safari on iOS pans the page to a focused field. Safari reports `innerHeight` as the visual viewport's height during that pan, so the height read 0, as if no keyboard were up. At a visual-viewport scale of 1, where `innerHeight` equals the visual viewport's height and the root is as wide as the visual viewport, the layout viewport's height now takes the root's client height where it is larger.

@vjeux
