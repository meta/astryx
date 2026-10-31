---
'@astryxdesign/core': patch
---

[chore] BottomSheet's releases, entrance, exit and dim run on one interactive-transition driver inside core's motion foundation, with no change in how they look or move. Its rules decide a release once, from where it projects (spec:AST-094), on the release velocity of spec:AST-100's tracker. Nothing is exported.

@vjeux
