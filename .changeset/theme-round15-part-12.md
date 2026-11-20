---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show`: the sample page's table is striped, so Core's own row stripe, and a theme's stripe color, show in the preview and its pictures.

- `astryx experimental theme editor set`: a whole-part setting is repeated on the theme's own variant rules that would beat it, also when such a rule is under several visual props at once or Core scopes it to one mode, and a setting made for one mode is repeated in that mode, once per variant. Before, a light-mode hover on tabs did not show on a light-mode selected tab. A variant the theme fills itself in both modes keeps its own fill.

@josephfarina
