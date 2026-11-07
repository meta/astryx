---
'@astryxdesign/core': patch
---

[fix] `LayoutContent`: the edge away from a single start panel now takes the Layout-edge inset, so `padding={0}` on the Layout makes it full bleed, and with `contentWidth` its children end one Layout-edge inset inside the content-width frame, as they do without panels. Each edge now publishes the padding it applies, so a full-bleed child such as a Table lines up beside an end panel and under a header without a divider. A Layout nested under a header or footer without a divider keeps its own content spacing instead of taking the outer collapse.

@cixzhang
