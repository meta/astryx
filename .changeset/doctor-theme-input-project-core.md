---
'@astryxdesign/cli': patch
---

[fix] `doctor`'s private theme variables check now loads each theme input with the Core the project installed when the CLI is installed for the computer. Before, in an app with Core and a theme package but no CLI in the project, the check failed for every theme, because that CLI has no Core of its own: "Added theme inputs set private --_* variables directly (…: input could not be inspected …)". When the project's Core isn't installed yet, as in a fresh clone, the check now says so instead of failing.

@josephfarina
