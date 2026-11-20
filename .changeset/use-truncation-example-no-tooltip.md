---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] The useTruncation example and docs no longer wrap a table cell's text in a Tooltip that repeats it, which a screen reader read twice. The example's cells now use Text's `maxLines`, on one line or clamped to two, whose own tooltip shows the full text only while it is cut off and adds no second description.

@cixzhang
