---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: several states saved joined by `+` with spaces around it (`"selected + hover"`) are read as those states, as `--state` reads them typed, with a note. Before, every command refused the theme.

A part's own state saved by hand in a spelling the editor reads (`is-pressed` on button) no longer leaves `compile` refusing after `show`: the build reads the state, and the settings stay as saved until a change writes the part's spelling.

@josephfarina
