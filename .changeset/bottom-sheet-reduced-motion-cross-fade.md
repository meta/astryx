---
'@astryxdesign/core': patch
---

[fix] BottomSheet follows the reduced-motion design rule. With `prefers-reduced-motion: reduce`, a sheet's entrance, exit, recede and replace handoff — a `BottomSheetSwitcher` step's too — no longer travel or scale: on a touch screen (`pointer: coarse`) the entering sheet fades in at its resting place and the leaving or retained sheet fades out where it is, opacity only, within 200 ms; with a mouse, trackpad or keyboard the change is immediate, except that a swipe dismissal — a transition a touch drag's release started — fades out in place on every pointer. Before, the motions ran shortened transforms on every pointer and nothing cross-faded.

@imdreamrunner
