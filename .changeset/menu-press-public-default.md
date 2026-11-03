---
'@astryxdesign/core': patch
---

[feature] `useMenuPress` with no `longPressDelayMs` now follows DropdownMenu's finger rules on every device (`spec:AST-094` FR25, FR29, FR43): a finger opens the menu as it presses (inside a scroll view, once the 150 ms content-touch delay has passed), and the finger that opened it picks a row only after moving 10 px. To keep the previous behavior, a 500 ms hold and a pick at the opening finger's lift, pass `longPressDelayMs: 500`.

@vjeux
