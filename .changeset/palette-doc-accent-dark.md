---
'@astryxdesign/cli': patch
---

[docs] `astryx docs author-a-theme generate-a-palette` says that a `themePalette()` accent or status seed is pinned exactly at its nearest light shade and in dark only when it reads there, so the dark accent fill can be a different shade, and shows how to keep one brand fill in both modes: set both halves of `--color-accent` and `--color-on-accent` as explicit tokens.

Reported by @ejc3.

@cixzhang
