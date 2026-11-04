---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] The stock theme's dark-mode accent (`--color-accent`) is now `#0171E3` instead of `#2694FE`, so white text on an accent fill, such as a primary Button's label, meets 4.5:1 (4.70:1, was 3.11:1). Light mode keeps `#0064E0`, and the dark text, icon and border accent colors are unchanged. The theme template that `astryx theme template` writes uses the same dark accent, and the generated color token docs list it.

@cixzhang
