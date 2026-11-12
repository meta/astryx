---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: font shorthands on a part split whole, and color mixes read.

- A CSS `font` value on a part is split into every longhand it holds (`font-variant-caps small-caps`, `font-stretch condensed`, style, weight, size, line height, family). A lone keyword goes to its own longhand (`bold` is `font-weight bold`), never to `font-family`, and a system font keyword (`caption`) gets a family that works.
- A `color-mix()` of two fixed colors in srgb, srgb-linear, xyz, oklab or oklch is worked out to the color it gives, so a color dial takes it. A mix the editor cannot work out says so and asks for the mixed color.

@josephfarina
