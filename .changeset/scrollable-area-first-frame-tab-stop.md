---
'@astryxdesign/core': patch
---

[fix] A scroll viewport that owns keyboard access (`ScrollableArea`, and the Table, CodeBlock, BottomSheet and Schedule viewports built on the same hook) is a tab stop from the first frame its content overflows. Content that arrived already overflowing, such as loaded data replacing a loading state, used to scroll for at least one animation frame, and longer on a busy page, before the viewport joined the tab order. During that time a keyboard user could not reach it and an accessibility audit reported `scrollable-region-focusable`.

@cixzhang
