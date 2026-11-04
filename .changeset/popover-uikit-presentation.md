---
'@astryxdesign/core': patch
---

[feature] Under a finger (a coarse primary pointer, on any touch device), Popover grows out of its trigger, wide before tall, with its edge held on the trigger, and shrinks back into the trigger when it closes. The growth plays the theme's entrance duration and easing, and the shrink plays its exit duration and easing, on the compositor. A close during the growth, or an open during the shrink, turns back from where the popover is. With reduced motion it cross-fades in and out, opacity only, in 200 ms or less. A fine primary pointer (a mouse) keeps its entrance. A tap that lands while it grows is ignored, and a pan started then scrolls nothing. The shrink plays on the layer runtime's exit copy, of which Popover is the first user. The growth starts in the next animation frame, before that frame paints, so the opening tap does no extra layout.

@vjeux
