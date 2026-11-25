---
'@astryxdesign/core': patch
---

[fix] Text, Heading: with `maxLines={1}`, a cut label in one script now keeps its start on either page. On a right-to-left page, a cut Latin label used to show its end ("…onth") and now shows its start ("Mon…"), as Button, SegmentedControl and Table headings already do. A Hebrew or Arabic label on a left-to-right page keeps its start too. End-aligned text, a rich node, and text that mixes both scripts follow the page as before.

@cixzhang
