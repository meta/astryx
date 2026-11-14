---
'@astryxdesign/core': patch
---

[feat] A theme's component overrides can hold `@light` and `@dark` blocks: properties, pseudo-class overrides and pseudo-elements that apply only where the element's color mode is that mode, as `Theme` resolves it from its own `mode`, the system preference, or a `MediaTheme` surface. Inside media surfaces a block applies as the `onDark` and `onLight` overrides do: inside any surface of its mode, so where surfaces of both modes enclose an element (a light `MediaTheme` inside a dark one) both blocks apply and the light block wins a property both set. Where no enclosing mode matches, the block writes nothing, so every other rule applies there as it would without it, and it can be any value, not only a color. Themes without these blocks compile to the same CSS.

@josephfarina
