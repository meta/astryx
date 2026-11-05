---
'@astryxdesign/core': patch
---

[chore] Internal: Core's internal touch entry re-exports what Lab's useRefreshControl reads. That is the pan recognizer, its hook and the gesture types, and the motion animator. It is also the motion math, the map of a companion curve, the UIKit scroll table of its pull, and the motion-role parsers. None is in the public entry. Apps import nothing new.

@vjeux
