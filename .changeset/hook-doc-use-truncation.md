'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Hook docs for `useTruncation`, so `astryx hook useTruncation` and `astryx search` return it, and a `useTruncation — Tooltip on Cut-Off Text` example block: a narrow table column where a Tooltip with the full path appears only on cells the hook reports as cut off (single-line ellipsis and a two-line clamp), while a short path shows none.
