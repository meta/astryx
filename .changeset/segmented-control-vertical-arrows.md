---
'@astryxdesign/core': patch
---

[fix] `SegmentedControl` answers ArrowUp and ArrowDown, as the WAI-ARIA radio group pattern asks: ArrowDown moves to the next segment and ArrowUp to the previous one, selecting it, skipping disabled segments and wrapping at the ends. Before, only ArrowLeft and ArrowRight moved, so a screen-reader user pressing ArrowDown on a segment heard nothing change. ArrowLeft and ArrowRight still follow the visual direction under right-to-left layouts; ArrowUp and ArrowDown keep logical order. (#8990)

@AKnassa
