---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] The typography docs say what Core builds, in one rule: a heading with no `family` takes the body's whole font list; with its own `family`, only its own `fallbacks`; `fallbacks` with no `family` build nothing. `TypographyConfig`, its `heading` field and `defineTheme`'s `typography` say it, as do the `font-setup` and `fonts-and-assets` doc pages.

@josephfarina
