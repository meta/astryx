---
'@astryxdesign/core': patch
---

[fix] Toast's own swipe (with a fine pointer, or `presentation="toast"`) now runs on the shared gesture system, as the notification swipe already does. It begins after 10 px of travel toward the edge instead of 8, a second finger no longer cancels a swipe that has begun (lifting the first finger still dismisses past the distance or as a flick), and a second finger that lands before the swipe begins leaves the touch to the page, so it can pinch. The card's feedback and release rule are unchanged.

@vjeux
