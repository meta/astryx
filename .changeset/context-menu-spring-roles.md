---
'@astryxdesign/core': patch
---

[chore] Internal: the touch motion tables register the three context-menu springs spec:AST-094 FR4 names (`springs.contextMenuLift`, `springs.contextMenuDismiss` and `springs.contextMenuMorph`, a new row at response 0.3 s and damping ratio 0.8) as internal motion roles, so the registered roles are FR4's again. Nothing public changes: themes do not set motion roles, and no shipped component reads these springs yet. (#9432)

@vjeux
