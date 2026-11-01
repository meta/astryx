---
'@astryxdesign/core': patch
---

[fix] A BottomSheet drag follows the finger the way an iOS sheet does. The sheet stays exactly under the finger between detents, instead of being pulled toward a nearby detent in the last 40 px; the release picks where it lands. Pulled up past its tallest detent, it stretches by UIKit's rubber band, no farther than the space it reserves below. This applies to a finger or a pen where the primary pointer is coarse; a mouse, and any drag where the primary pointer is fine, is unchanged: it still eases onto a nearby detent and stretches a little past the tallest one.

@vjeux
