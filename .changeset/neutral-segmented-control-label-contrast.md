---
'@astryxdesign/theme-neutral': patch
'@astryxdesign/cli': patch
---

[fix] Neutral: an unselected SegmentedControl label meets 4.5:1 in dark mode on AppShell's surface. The track is translucent, so it lightens the surface under the label: `#9e9e9e` on `#3c3c3c` measured 4.11:1. The label now takes `neutral.dark[80]` (6.46:1), the same lift Neutral already gives secondary text on its selected rows and pills. Light mode is unchanged, and the CLI's Neutral theme template matches.

@cixzhang
