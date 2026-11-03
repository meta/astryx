---
'@astryxdesign/core': patch
---

[feature] Under a finger, on every device, a DropdownMenu or MoreMenu trigger now opens its menu as the finger presses, instead of after a 500 ms hold (`spec:AST-094` FR29, FR43). Inside a scroll view it opens once the 150 ms content-touch delay has passed with no scroll, so a scroll that starts on it still scrolls. To keep the previous behavior, a tap that opens at the lift and a 500 ms hold, pass `presentation="popover"`. A mouse is unchanged.

@vjeux
