---
'@astryxdesign/core': patch
---

[chore] Internal: UIControl press tracking with control and cell profiles and the gesture hooks. `paintPress` in `utils/pressFeedback.ts` writes `data-astryx-press` for every press it tracks; the action-group tracker writes its groups' presses itself. Not exported from the package entry point.

@vjeux
