---
'@astryxdesign/core': patch
---

[fix] TypeScript users following `usePressFeedback`'s documented usage no longer get a type error: every `interactionOverlayStyles` variant now fits an Astryx component's `xstyle`. Its press-arm properties (`animationName`, `animationDuration`, `animationTimingFunction`, `animationFillMode`, and the colour variants' `backgroundImage`) were typed `unknown`; they now carry their CSS value types. The generated CSS is unchanged.
@cixzhang
