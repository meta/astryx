---
'@astryxdesign/core': patch
---

[chore] Internal: one progress module for the motion foundation. `progressCurve` gives a spring's progress from 0 to 1 as a closed-form curve, `mapProgress` maps any curve from another (a companion's dim following a sheet, a clamped range), `mapRange` is the clamped linear map they share, and `presentedProgressVelocity` reads the velocity an interrupted motion continues from. One velocity unit throughout: progress per second. Nothing public changes; no component imports it yet.

@vjeux
