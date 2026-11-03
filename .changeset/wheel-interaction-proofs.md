---
'@astryxdesign/core': patch
---

[chore] Internal: browser proofs for the touch picker wheel in Chromium and WebKit, which a finger gets on every engine. A flick coasts on UIKit's curve onto the row it projects and commits on arrival. A finger landing on a coasting wheel stops it, and it then eases onto the nearest row. A storyboard films a flick and its coast. In Chromium, the coast also keeps advancing every frame while the main thread is blocked, and does no Layout or Paint per frame. Under reduced motion, a flick still coasts as momentum with its rows flat, and a tap cross-fades onto its row, animating opacity alone for 200 ms or less. Opening the month and year wheels writes no element per year, and each year is drawn once. Under a mouse, a drag still scrolls today's column onto a row.

@vjeux
