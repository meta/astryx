---
'@astryxdesign/core': patch
---

[chore] Internal: the pager takes every pointer (`spec:AST-094` FR43). A mouse drags it as a finger does, and its pan follows a trackpad's horizontal scroll, at most one page from the page the swipe began on: a fling releases where the fingers lift, at their speed, while a scroll that stops, or a swipe that moved under a tenth of a page, releases still. A swipe that lands while the last one settles begins from that settle's page. A mouse wheel's scroll stays the page's.

@vjeux
