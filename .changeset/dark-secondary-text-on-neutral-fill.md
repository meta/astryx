---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] In dark mode, secondary text on a neutral fill (an unselected SegmentedControl label, AvatarGroup's "+N" count) now meets 4.5:1 contrast on the default surface and on a Card. The default dark `--color-text-secondary` is a little lighter: `#B0B5BB`, was `#AAAFB5`.

@josephfarina
