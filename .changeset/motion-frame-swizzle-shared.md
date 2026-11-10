---
'@astryxdesign/core': patch
---

[fix] A swizzled component that carries its own copy of Core's layout motion, spinner rotor or gesture sync now shares the package's: a layout change in one copy starts at the frame the other copy's change started in, so their glides land together; spinners from both copies are pinned to the timeline in one batch, so they stay in phase; and a gesture sync running in one copy holds the other copy's gesture callbacks too. No API changes.

@cixzhang
