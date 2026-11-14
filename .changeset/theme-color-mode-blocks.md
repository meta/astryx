---
'@astryxdesign/core': patch
---

[feat] A theme's component overrides can hold `@light` and `@dark` blocks: properties and pseudo-class overrides that apply only where the element's color mode is that mode, as `Theme` resolves it from its own `mode`, the system preference, or a `MediaTheme` surface. In the other mode the block writes nothing, so a value set for one mode leaves every other rule as it was there, and it can be any value, not only a color. Themes without these blocks compile to the same CSS.

@josephfarina
