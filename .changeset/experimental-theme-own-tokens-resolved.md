---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reads the page-wide tokens of your own `<theme>.theme.ts` however they are written (inline, a const, a spread, `as const` or `satisfies`), from the `defineTheme` the build loads, never a sibling theme in the same file; a value it cannot read in the file comes from the build. The `experimental theme template --overwrite` and `compile --out` help match what they do.

@josephfarina
