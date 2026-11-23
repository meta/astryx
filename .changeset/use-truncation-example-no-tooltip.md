---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] The useTruncation example no longer wraps a table cell's text in its own Tooltip that repeats it. Its cells use Text's `maxLines`, on one line or clamped to two, whose built-in tooltip shows the full text only while it is cut off, and the hook docs point a full-text tooltip at Text and Heading.

@cixzhang
