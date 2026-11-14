---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] The typography docs say what Core builds, in one rule: a heading with no `family` takes the body's whole font list; with its own `family`, only its own `fallbacks`; `fallbacks` with no `family` build nothing. `TypographyConfig`, its `heading` field, `defineTheme`'s `typography`, the `fonts-and-assets` doc page and the theme template say it; the `font-setup` page says a heading with no family uses the body's and points to `fonts-and-assets` for the rest.

@josephfarina
