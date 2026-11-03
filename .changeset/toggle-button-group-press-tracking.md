---
'@astryxdesign/core': patch
---

[feat] Under the touch presentation, ToggleButtonGroup tracks a finger's or a pen's press across its toggles, like a menu. Press a toggle and slide across the others: the highlight follows, and only the toggle you lift on changes. Lifting outside the group changes nothing. A mouse press is unchanged: it acts as a native toggle's, on the toggle it began on. With a finger, each toggle's target grows toward 44 px, up to half the gap to a neighbour, without the toggles growing. A toggle without a value keeps its own press, and the keyboard is unchanged. Before, each toggle tracked only its own press, and sliding off it changed nothing. An enabled ToggleButtonGroup root is position: relative under a coarse pointer, so absolutely positioned children anchor to the group. With a fine primary pointer, the group is unchanged.

@vjeux
