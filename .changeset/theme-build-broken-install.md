---
'@astryxdesign/cli': patch
---

[experimental] When a theme editor build stops because a package the CLI uses is broken in node_modules (it needs a package it declares, and that package is missing), the theme editor names the missing package, the package that needs it and how to install them again (`ERR_DEP_MISSING`): the app's install command for the app's own packages, or, when the run uses a CLI copy of its own (global, one-off or cached) and the app's install does not hold the package that needs it, that copy, instead of saying the theme did not build.

@josephfarina
