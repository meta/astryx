---
'@astryxdesign/core': patch
---

[chore] Internal: the reduced-motion mark carries a marker class of its own, on the theme's root and on `<html>` for the root theme, and the chat scroll, streaming text and a swipe row's settle read the mark. No theme can set `reducedMotion: 'always'` yet, so nothing changes for anyone.

@vjeux @cixzhang
