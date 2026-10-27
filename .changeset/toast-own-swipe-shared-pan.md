---
'@astryxdesign/core': patch
---

[feat] A mouse now swipes a toast too, as a finger and a pen do: once the swipe takes a mouse or pen drag, the text selection it started is cleared and none follows. A trackpad's two-finger scroll toward the edge moves the card and dismisses it the same way; a mouse wheel's notches stay the page's, so scrolling past a toast never dismisses it. Toast's own swipe (with a fine pointer, or `presentation="toast"`) now runs on the shared gesture system, as the notification swipe already does: it begins after 10 px of travel toward the edge instead of 8, a second finger no longer cancels a swipe that has begun (lifting the first finger still dismisses past the distance or as a flick), and a second finger that lands before the swipe begins leaves the touch to the page, so it can pinch. The card's feedback and release rule are unchanged.

@vjeux
