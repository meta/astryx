---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: an editor theme whose icon registry is a module in its own folder (as compile advises) now loads in the editor's checks, and its app copy carries that module, so `show` and `set` check it and `compile --check` passes. A theme source whose tokens replace the settings' (a spread of `defineTheme`'s result with a `tokens` field of its own) is refused by name instead of every change being saved and never built. A source name cut short (`themes/t/t`, `themes/t/t.theme.`) or a theme folder in other letters is offered the theme source. An empty `--out` is refused like a blank one. A weight given in a part's `font` shorthand is loaded, and weights are judged per family, so no font gets a gap note for a weight only another family uses. The stable `theme build` of an editor theme says it does not write (or check) the theme's app copy, and names the compile that does. A copy's compile with `--out` in the theme's own folder offers only a line compile takes, once.

@josephfarina
