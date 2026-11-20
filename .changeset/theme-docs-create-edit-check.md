---
'@astryxdesign/cli': patch
---

[experimental] The theme docs, the agent block that `astryx init` writes, the root and `theme` help, and `init`'s next steps lead with one path for making a theme: describe the look as traits with `astryx experimental theme create <name> --traits '<json>'`, which writes a complete theme file; edit any line of that file by hand; run `astryx experimental theme check <name> --fix` after every edit. The experimental theme editor commands keep working.

@josephfarina
