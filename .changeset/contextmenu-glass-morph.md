---
'@astryxdesign/core': patch
---

[feat] Under a finger, on every touch device, when a held finger opens a ContextMenu, the menu now grows out of the finger as iOS 26's does: it starts small at the press point and grows into its place beside the lifted trigger, overshooting slightly, as it fades in. Only its position, scale and opacity move, on the compositor. Under Reduce Motion the menu cross-fades in where it is instead, in 200 ms: nothing moves or grows. The growth's spring is a motion role a theme can retune; `astryx docs motion` lists it.

@vjeux
