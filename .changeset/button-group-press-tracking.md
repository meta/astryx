---
'@astryxdesign/core': patch
---

[feat] Under the touch presentation, ButtonGroup tracks a finger's or a pen's press across its buttons, like a menu. Press a button and slide across the others: the highlight follows, and the button you lift on runs. Lifting outside the group runs nothing. A mouse press is unchanged: it acts as a native button's, on the button it began on. With a finger, each button's target grows toward 44 px, up to half the gap to a neighbour, without the buttons growing. A menu trigger in the group keeps its own opening, and the keyboard is unchanged. Before, each button tracked only its own press, and sliding off it ran nothing. An enabled ButtonGroup root is position: relative under a coarse pointer, so absolutely positioned children anchor to the group. With a fine primary pointer, the group is unchanged.

@vjeux
