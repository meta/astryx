---
'@astryxdesign/cli': patch
---

[fix] `astryx docs global/problems` now also explains the "installing CLI release" line outside a project, where the astryx command you started downloads its own Core once. Before, the page said only that a project's own CLI could not start, and told you to install the project's dependencies.

@josephfarina
