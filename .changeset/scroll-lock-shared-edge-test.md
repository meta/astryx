---
'@astryxdesign/core': patch
---

[chore] Internal: the scroll lock's touch guard asks the gesture system's native-scroll test whether an element under a finger can scroll, instead of keeping its own copy. The copy left out `overflow: overlay`, which current Chromium and WebKit compute as `auto`, so pages there behave the same. (#9812)

@vjeux
