---
'@astryxdesign/cli': patch
---

[chore] Internal: a gap-report handler's time budget starts once its module has loaded. Starting its worker and loading the module have the default deadline, so a short budget in a contract test no longer covers a slow start on a busy machine. The 30-second handler budget is unchanged.

@vjeux
