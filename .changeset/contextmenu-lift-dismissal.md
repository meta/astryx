---
'@astryxdesign/core': patch
---

[feat] Under a finger, on every touch device, closing a ContextMenu opened by a held finger now follows iOS 26. The menu shrinks back into the finger as it fades, on the layer runtime's exit copy, while the lifted trigger returns to its place and its shadow and the backdrop clear. A close while the menu is still growing (Escape; a tap then is swallowed) shrinks it back from where it is, keeping its motion, with no jump to its full size. Picking an action closes it the same way. A press that lands on the fading backdrop opens nothing and reaches nothing under it, even when it is held past the end of the close. Only position, scale and opacity move, on the compositor. Under Reduce Motion everything fades out where it stands instead, in 200 ms.

@vjeux
