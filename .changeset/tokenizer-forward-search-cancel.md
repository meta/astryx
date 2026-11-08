---
'@astryxdesign/core': patch
---

[fix] Tokenizer forwards `cancel` to its `searchSource`, so a newer search, closing the menu or the sheet, focus leaving the field, or unmounting cancels the consumer's in-flight search (for example, to abort its request). Previously the inline field wrapped the source to filter selected items and dropped `cancel`, and the bottom-sheet presentation never called it.
@hurrymaplelad
