---
'@astryxdesign/cli': patch
---

[fix] An installed dependency that ships an Astryx integration manifest which fails to load because a package it imports is missing (a broken install) is now reported as that package's integration issue: every command prints the usual one-line warning, and `doctor`'s integration contributions check names it with the load error. Before, it dropped out silently and only an info line in `doctor` mentioned it. A command that cannot load also reports why whatever options it was given (`component --list` used to answer "unknown option").

@josephfarina
