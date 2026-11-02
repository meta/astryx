---
'@astryxdesign/core': patch
---

[fix] TypeScript users applying `interactionOverlayStyles` through an Astryx component's `xstyle` no longer get a type error. The touch-press properties of each variant (`animationName`, `animationDuration`, `animationTimingFunction`, `animationFillMode`, and the colour variants' `backgroundImage`) now carry their CSS value types instead of `unknown`. The generated CSS is unchanged. (#9440)
@cixzhang
