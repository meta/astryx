---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor undo <theme> <word>` with no setting named never leads with a plain step back, which can take back another change than the one typed: a value one setting holds gets that setting's undo, a value several hold gets each one's, a word nothing holds gets a look at the theme (`show`), and only `all` or `last` offers the step back.

@josephfarina
