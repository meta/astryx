---
'@astryxdesign/core': patch
---

[chore] Internal: the motion foundation has one release policy, `motion/resolveSnapPoint.ts` (where a release lands: a flick goes at least to the next snap point, a release moving back toward its start cancels to it), on the `selectSnapPoint` primitive; paging moves to `motion/selectPage.ts` on top of it. No behavior change.

@cixzhang
