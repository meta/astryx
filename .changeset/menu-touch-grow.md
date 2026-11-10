---
'@astryxdesign/core': patch
---

[feature] Under a finger or a pen, a DropdownMenu or MoreMenu now grows out of its trigger as it opens and shrinks back into it as it closes, on a Popover's path and timing (`spec:AST-094` FR31). A tap's open grows as a hold's does. The grow's code loads at the first touch on a trigger, or on the page where touch is the primary input, so a page that no finger touches never loads it. A mouse, the keyboard and `presentation="popover"` keep the layer's own entrance.

@vjeux
