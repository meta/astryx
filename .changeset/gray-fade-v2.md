---
'@astryxdesign/cli': patch
---

[fix] Palette recipe `astryx-oklch-v2`: a gray family's color now fades toward white the way a gray scale's does, so a colored gray (a slate `#64748b`, a warm `#78716c`) gives the page and the cards on it only a faint tint instead of a clearly blue or cream page; its darker shades keep their color. v1, and so every shipped palette and existing config, is unchanged. The neutral dial's help says so, and names `--color-background-body` for a clearly tinted page.

@josephfarina
