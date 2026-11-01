---
'@astryxdesign/core': patch
---

[chore] Internal: gesture host fixes from review. A claimed pen holds only its own stylus touches, and a finger is matched to its scroller, its target and a moving element along the flat tree, through slots and shadow roots. A disabled recognizer brings no listener; where a finger comes from its pointer events, a claimed finger's touchend is cancelled too, a touchscreen laptop's included and inside an open shadow root, a hold's that claims with its lift included; and a pen or a pointer-read finger the window's blur cancelled clicks nothing at its later lift, while a mouse keeps its click. Not exported from the package entry point.

@vjeux
