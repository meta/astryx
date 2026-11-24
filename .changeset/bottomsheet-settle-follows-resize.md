---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a window resize while the sheet settles (after a release, or after a drag is cancelled) now lands the sheet on its detent as the new window resolves it. Before, a phone rotation or a keyboard change during that settle left the sheet off its stop, short of it in a taller window and past it in a shorter one, until the next resize, which then moved it in one jump. A resting sheet also measures again once the space it keeps below the screen follows the new window, so it no longer rests off its stop either.

@vjeux
