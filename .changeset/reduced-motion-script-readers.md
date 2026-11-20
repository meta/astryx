---
'@astryxdesign/core': patch
---

[chore] Internal: the remaining script readers of Reduce Motion read a theme's `reducedMotion: 'always'` beside the person's setting, through `motion/reducedMotion.ts`: Carousel's button and index scrolls, BottomSheet's alignment, cross-fade, haptic and scroll settle, MobileNav's and AppShell's close hold, the mobile keyboard's scroll, press feedback's release, and Resizable's close slide. A guard test keeps any new script read of the setting going through the same rule. No theme can set `reducedMotion: 'always'` yet, so nothing changes for anyone.

@vjeux @cixzhang
