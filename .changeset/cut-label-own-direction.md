---
'@astryxdesign/core': patch
---

[fix] A cut Hebrew or Arabic label keeps its start on a left-to-right page, as a cut Latin label already does on a right-to-left page. This covers Button, SegmentedControl, truncating Table headings (plain-text, sortable and resizable), Outline, ChatToolCalls, the Chat trigger menu's default item labels and TopNav's plain-text mobile-bar heading. A cut label now takes its content's direction on any page: right to left for text with a right-to-left letter, left to right for other plain text.

@cixzhang
