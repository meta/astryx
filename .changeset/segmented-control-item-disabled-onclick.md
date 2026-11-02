---
'@astryxdesign/core': patch
---

[fix] A disabled `SegmentedControlItem` no longer runs a caller's `onClick` (`spec:AST-085` FR2). Before, the segment refused to select but still called the handler on a click, and on Enter or Space for the selected segment of a group disabled with a reason, which stays focusable. This covers a segment disabled by its own `isDisabled` and one disabled by its group. An enabled segment is unchanged: its `onClick` still runs first and can still cancel selection with `preventDefault()`.

@parinith-web
