---
'@astryxdesign/cli': patch
---

[fix] The heading truncation, bottom sheet menu, step content, step indicator, step states and grid focus examples lay out with HStack and VStack instead of hand-written flex wrappers, so their gaps follow the theme's spacing steps. They look the same in the default theme; themes with roomier spacing show wider gaps.

@josephfarina
