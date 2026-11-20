---
'@astryxdesign/cli': patch
---

[fix] In a project, the update notice and `doctor`'s matching fixes now upgrade every Astryx package the project lists that is released with Core, such as its themes, beside Core and the CLI. Before, the command upgraded only Core and the CLI, so following it left a theme on the old release; its exact Core peer no longer matched, and `doctor` reported it.

@josephfarina
