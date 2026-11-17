---
'@astryxdesign/cli': patch
---

[fix] Outside a project, when a tool runs the CLI for you, `template`, `build` and `theme eject` no longer name an integration the tool approves and installs as a missing dependency. `render` already gives the page that integration, so the page renders without installing it. Also, `render` now takes an approved integration only from the tool's package set itself. Before, it also took one from a folder above that set.

@josephfarina
