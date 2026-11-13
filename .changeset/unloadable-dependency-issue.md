---
'@astryxdesign/cli': patch
---

[fix] An installed dependency that ships an Astryx integration manifest which fails to load because a package it requires (a `dependencies` entry or a peer not marked optional) is missing (a broken install) is now reported as that package's integration issue: `component`, `template`, `theme`, `discover` and `search` print the usual one-line warning, and `doctor`'s integration contributions check names it with the load error. Exit codes are unchanged. A command that cannot load also reports why whatever options it was given (`component --list` used to answer "unknown option").

@josephfarina
