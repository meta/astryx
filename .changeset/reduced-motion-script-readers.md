---
'@astryxdesign/core': patch
---

[chore] Internal: the remaining script readers of Reduce Motion read a theme's `reducedMotion: 'always'` beside the person's setting, through the reduced-motion mark's owner module, which loads no animator: Carousel's button and index scrolls, BottomSheet's alignment, cross-fade, haptic and scroll settle, MobileNav's and AppShell's close hold, the mobile keyboard's scroll, press feedback's release, and Resizable's close slide. A guard test fails a new script spelling of the setting's query outside that module and a listed set of files, and any call of the animator's setting-only read outside the motion foundation. No theme can set `reducedMotion: 'always'` yet, so nothing changes for anyone.

@vjeux @cixzhang
