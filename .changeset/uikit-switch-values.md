---
'@astryxdesign/core': patch
---

[chore] Internal: UISwitch's values measured on iOS 26.2 (its geometry, the springs of the thumb's lift, settle, travel and drag, the track colour, its minimum lift time and its flip distance) join the UIKit constants table as internal constants, with the rule a switch's drag follows as a pure function: the finger flips the switch once it has travelled the track width minus the thumb width from where it landed, coming back past that point flips it back, and lifting the finger commits the side shown, or toggles when nothing flipped. Not exported from the package entry point, and no theme sets them. Switch's touch presentation plays them.

@vjeux
