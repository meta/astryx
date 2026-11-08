---
'@astryxdesign/core': patch
---

[fix] Tokenizer's inline field (`presentation="popover"`, and the default `adaptive` with a fine pointer or on a screen that is not compact) forwards `cancel` to its `searchSource`, so a newer search, closing the menu, focus leaving the field, or unmounting cancels the consumer's in-flight search (for example, to abort its request). Previously it wrapped the source to filter selected items and dropped `cancel`, so it was never called. The bottom-sheet presentation does not call `cancel` yet.
@hurrymaplelad
