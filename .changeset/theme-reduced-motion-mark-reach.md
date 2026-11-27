---
'@astryxdesign/core': patch
---

[chore] Internal: a theme's `reducedMotion: 'always'` now reaches the hooks that hold no element. Theme passes it down through a context (a nested theme keeps an ancestor's), and `useReducesMotion` reads it beside the person's setting. In this change the chat scroll and streaming text read it; a swipe row's settle and the animator already read the mark. The other script readers (Carousel, BottomSheet, MobileNav, AppShell, the mobile keyboard's scroll, press feedback and Resizable) follow in a separate change. No theme can set `reducedMotion: 'always'` yet, so nothing changes for anyone.

@vjeux @cixzhang
