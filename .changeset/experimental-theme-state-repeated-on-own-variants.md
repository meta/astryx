---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a whole-part state setting (a hover on every table row) is repeated on the theme's own rules that would beat it, also when such a rule is under several attributes at once (a table row's `parity:odd` stripe in a striped table) or Core scopes it to one mode, and a setting made for one mode is repeated in that mode. Before, a hover on table rows did not show on striped rows, and a light-mode hover did not show on a light-mode selected tab.

@josephfarina
