---
'@astryxdesign/cli': patch
---

[chore] The Tokenizer blocks and the table-inbox and work-item-detail page templates follow Tokenizer's `'adaptive'` default, so on a compact touch screen they show the bottom sheet. Their `endContent` and `renderToken` work there as in the inline field; `hasClear` and the overflow modes apply to the inline field, and the Clear and Overflow blocks say so. The rule: docs examples follow `adaptive`; the stories that are fixtures for inline-field geometry (Caret placement, Logical order, RTL end lane, Long token beside the end lane) keep `presentation="popover"`. The table-inbox and work-item-detail back arrows mirror in right-to-left.

@imdreamrunner
