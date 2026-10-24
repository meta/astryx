---
'@astryxdesign/core': patch
---

[experimental] Gesture recognizer fixes: a timer that fires late lets queued input run first and moves the event clock only to its deadline; `cancel()` on an idle recognizer leaves it `possible`; a waiting recognition that fails gives its claimed touches back; a two-finger double tap compares centroids; a swipe fails only once no allowed direction is reachable; Hover recovers after a mid-hover cancel; setting `rotation` keeps the velocity continuous; a handoff pan's translation never reads below zero. The early claim is now opt-in (`claimDistance: 'early'`, from `UIKIT_GESTURES.pan.earlyClaimDistance`) and a committed claim survives a second finger and scrollable content. `VelocityTracker` keeps `uikit` and main's `window` estimator only.

@vjeux
