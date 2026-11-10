---
'@astryxdesign/core': patch
---

[feat] Tokenizer forwards BaseTypeahead's `menu` and `onOpenChange` in its inline presentation, and its handle gains `open()` and `close()`. A token whose own button calls `open()` with a dialog-role menu opens the dialog, and Escape returns focus to that token: focus that a press puts on a token's control, and the menu's focus return, stay there instead of moving to the input. The sheet presentation keeps its own sheet.

@cixzhang
