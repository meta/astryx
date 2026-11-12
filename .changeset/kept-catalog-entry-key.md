---
'@astryxdesign/cli': patch
---

[fix] A catalog `search` or `build` kept between runs now records which inputs it is for and is used only for those, so a cache file copied under another entry's name is never used.

@josephfarina
