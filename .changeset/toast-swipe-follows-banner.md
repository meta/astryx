---
'@astryxdesign/core': patch
---

[feat] Under a finger (a coarse primary pointer), a Toast now follows iOS notification banners. The card stays still for the first 14 px of finger travel and then follows at 0.55 of the finger, with no jump. A swipe that turns back away from the toast's edge stretches the card that way and springs it back. On release, a quick flick toward the edge dismisses even when it barely moved the card, as does a drag that leaves the card far enough out; anything else springs the card back. However a toast is dismissed (a swipe, the close button, the timeout, the app's dismiss), the card leaves as the banner does: it slides past its edge from where it is, without fading, and its row closes after it. A finger that lands on the card while it springs back or leaves catches it, and the card follows the finger. Before, a toast under a finger moved with the finger as it faded and shrank, and faded out when dismissed. With a fine pointer nothing changes. Under reduced motion nothing slides, springs or drifts: under a finger (a coarse primary pointer) the toast fades in place, and with a mouse or keyboard it changes at once.

@vjeux
