---
'@astryxdesign/cli': patch
---

[chore] Internal: the search gather runs in its own listing-cache operation, so a caller that gathers candidates directly lists each folder about once, as `astryx search` already does. The command's results and output are unchanged. Not exported from the package entry point.

@vjeux
