---
'@astryxdesign/core': patch
---

[feature] Under a finger, on every device, the finger that opened a DropdownMenu or MoreMenu now picks a row only after it has moved 10 px (`spec:AST-094` FR29, FR43), so a menu that appears under a resting finger never picks the row beneath it, however long the finger rests. To keep the previous behavior, where that finger's lift picked once the press had lasted 300 ms, pass `presentation="popover"`. A mouse and the public `useMenuPress` hook are unchanged.

@vjeux
