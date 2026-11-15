---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the check of a theme's own values judges every block the build writes from. Each adaptation rule's tokens, local tokens and parts are judged, named as the file writes them (`adaptations.rules[0].value…`); a `var()` reads the custom properties the theme sets in `tokens` and `localTokens`; a part's property given as text gets the check `set` gives it, a property that reads a design token of a kind it does not take (`background-color: var(--radius-element)`) is refused in `set` and in the file alike, and a misspelled property is refused with the one meant; and a theme the source defines between the editor's settings and the exported theme is judged too, by its name and line. In typography, a weight with no type scale (which builds nothing) is named with the scale it needs, a weight refusal names the weight field, and a scale field that is no number is named as written (a symbol, `NaN`, `true`), never a crash.

@josephfarina
