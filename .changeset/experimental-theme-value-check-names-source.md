---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` and `compile` name more of what a theme's own source misspells or misplaces, each with its file and line:

- a field `defineTheme()` or an `onDark`/`onLight` block does not take (`component`, `tokenz`), with the field meant, read from the installed Core's own types;
- a `tokens` key one typo from a design token (`--color-acent`), pointing a property of the theme's own to `localTokens`;
- a part's pseudo-class one typo from one browsers know (`:hovr`), a part variable one typo from one the part reads that nothing in the theme reads (`--button-focus-ofset`), and a part variable's value of the wrong kind for its default;
- an unknown component (`cardd`, or a part named by its class), and a component entry that holds no block of properties;
- a typography role or field Core does not read, a heading level outside 1–6, a scale with no ratio, and the `fallbacks` field when it is what a family refuses;
- a part's `fontFamily` read as `set` reads a family list, and a `var()` of the theme's own property read as the text it holds;
- a `var()` of the wrong kind inside a token's function (`color-mix(in srgb, var(--radius-element) 50%, red)`), in the source and in `set`;
- a value in a theme the export extends from another file, named in that file;
- a path Core itself refuses (`adaptations.rules[0].when.pointr`), at its line. `theme build` gives the import hint only when an import did not resolve.

@josephfarina
