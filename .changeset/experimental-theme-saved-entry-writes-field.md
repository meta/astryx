---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor …`: a saved setting that writes one field two ways (`value` and `Value`, `on` and `--on`) is read the editor's way with a note naming both, and the next change writes the field once. A pasted declaration whose unquoted value went on past a space (`set t font=Inter, Arial`) is read whole, so the line offered with the theme left out works too.

@josephfarina
