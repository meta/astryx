---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show`: the sample page's table is striped, so a theme's row stripes (Core's own stripe, or a stripe a theme sets on either parity) show in the preview and its pictures.

- `astryx experimental theme editor set`: a whole-part state setting (a hover on every table row) is repeated on the theme's own rules that would beat it, also when such a rule is under several attributes at once (a table row's `parity:odd` stripe in a striped table) or Core scopes it to one mode, and a setting made for one mode is repeated in that mode. Before, a hover on table rows did not show on striped rows, and a light-mode hover did not show on a light-mode selected tab.

@josephfarina
