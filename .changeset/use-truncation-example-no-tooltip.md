---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] The useTruncation example and docs no longer wrap a table cell's text in a Tooltip that repeats it, which a screen reader read twice. One-line cells now use Text's `maxLines`, whose own tooltip adds no second description, and a two-line cell uses the hook to show a Show more toggle only when its text is cut off.

@cixzhang
