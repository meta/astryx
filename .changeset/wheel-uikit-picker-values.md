---
'@astryxdesign/core': patch
---

[chore] Internal: UIPickerView's values measured on iOS 26.2 join the touch motion tables as internal constants: the row pitch, the picker's height and its rubber band, the coast's stop speed and velocity floor, the snap at rest, the tap spin and the selection tick. The pure math a wheel moves with comes with them. It projects the row a release rests on as UIScrollView sums its deceleration, coasts with the rate re-solved to stop on that row, snaps, bounces at an end, rubber-bands, and spins to a tapped row. It is checked against UIKit's recorded frames. Nothing public changes: none of it is exported from the package entry point, and themes do not set these values.

@vjeux
