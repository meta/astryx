---
'@astryxdesign/core': patch
---

[feat] A theme's component overrides can hold `@light` and `@dark` blocks: properties, pseudo-class overrides and pseudo-elements that apply only where the element's color mode is that mode, as `Theme` resolves it from its own `mode`, the system preference, or a `MediaTheme` surface. Inside media surfaces the nearest surface decides, for up to five surfaces of alternating modes nested one in another, so a light `MediaTheme` inside a dark one (a toast over a dark surface) takes only the light block. Where no enclosing mode matches, the block writes nothing, so every other rule applies there as it would without it, and it can be any value, not only a color. Themes without these blocks compile to the same CSS.

@josephfarina
