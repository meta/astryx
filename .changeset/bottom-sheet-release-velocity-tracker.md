---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a drag reads its release velocity from Core's velocity tracker, on each event's own timestamp, also when a touch drag starts on the sheet's content. The release depends on the last two moves, so a move that reaches the page late earlier in a flick no longer slows the flick. A hold weighs on the first move after it, as iOS's filter does. Two rules differ from iOS: a finger that holds still for more than 40 ms before the lift releases nothing in motion, and a release needs two moves.

@vjeux
