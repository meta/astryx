---
'@astryxdesign/core': patch
---

[feat] Switch's press and drag work with a mouse and a pen as well as a finger: a drag past the flip point toggles the switch at the release, unless the pointer came back past where it pressed. A mouse or pen press released away from the switch leaves it alone, flipped or not, as a checkbox does. With a mouse the switch keeps its desktop look, and the value moves the thumb. On a touchscreen laptop a finger flips it by the same rule, with the desktop look.

@vjeux
