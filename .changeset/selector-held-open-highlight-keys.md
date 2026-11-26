---
'@astryxdesign/core': patch
---

[fix] A `Selector` or `MultiSelector` whose bottom sheet is still loading no longer moves its highlight on Arrow, Home, End, PageUp or PageDown, and a `MultiSelector` with option actions no longer moves it on ArrowLeft or ArrowRight either. There is no list yet to move across, so the sheet opens at its normal opening option instead of wherever those keys would have taken the highlight. Type-to-select letters are not covered by this change.

@HelloOjasMutreja
