---
'@astryxdesign/core': patch
---

[fix] Under a finger, Popover's growth shows its content from its first frame. The growth starts at opacity 0.001 rather than 0: Chromium skips drawing a layer at exactly 0, so the first frames of a growth from 0 showed the popover without its content. No 8-bit pixel differs from transparent at 0.001.

@vjeux
