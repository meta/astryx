---
'@astryxdesign/core': patch
---

[chore] Internal: gesture host fixes from review. A claimed pen holds only its own stylus touches, and a finger is matched to its scroller, its target and a moving element along the flat tree, through slots and shadow roots. Not exported from the package entry point.

@vjeux
