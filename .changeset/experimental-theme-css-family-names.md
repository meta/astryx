---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a font family name is read as CSS reads it, so an escaped name (`Gill\ Sans`, `"\5FAE\8F6F\96C5\9ED1"`) is a family, never a font file. A family the theme holds in its own property and reads with `var()` counts as a family it builds: the app copy loads its installed package and compile names it until then. `compile` gives the note `show` gives when the theme's own type tokens do not show on phones, and that note's fix for a weight is a rule for the same screens, which keeps it. The full report of an editor theme wires its app copy (`theme add`), not its editor folder.

@josephfarina
