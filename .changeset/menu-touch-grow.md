---
'@astryxdesign/core': patch
---

[feature] Under a finger or a pen, a DropdownMenu or MoreMenu now grows out of its trigger as it opens and shrinks back into it as it closes, on a Popover's path and timing (`spec:AST-094` FR31). A tap's open grows as a hold's does. Under Reduce Motion the menu fades in at its size and out where it stands. A mouse, the keyboard and `presentation="popover"` keep the layer's own entrance.

@vjeux
