---
'@astryxdesign/cli': patch
---

[fix] A value kept beside the search catalog (search's entry table) is keyed by the CLI code its catalog depends on and by the files that compute it, so an edit to an installed copy's code, as patch-package or a hand edit leaves it, is never answered from a value worked out before the edit.

@josephfarina
