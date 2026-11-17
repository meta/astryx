---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the check of a theme's own token values judges every token its source gives, a design token or the theme's own custom property, and a part's CSS properties: `null`, a boolean, an object or a number a property does not take bare is refused as no text, with its file and line, in `compile`, `set` and `show` alike. A BigInt or a symbol is named as it is (never a crash), a page token left `undefined` is not set (in a part's rule, where the build writes the text `undefined`, it is named), and a `var()` reads the custom properties the theme itself sets.

@josephfarina
