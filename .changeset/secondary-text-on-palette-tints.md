---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] Secondary text now reads on every palette tint. The default light `--color-text-secondary` is `#445564` (was `#4E606F`), so secondary text on a gray Card or any other `--color-background-<hue>` tint meets 4.5:1 over the surface and the page body. The dark value is unchanged. To keep the previous light colour, a theme can set `--color-text-secondary` to `light-dark(#4E606F, #B0B5BB)`.

@josephfarina
