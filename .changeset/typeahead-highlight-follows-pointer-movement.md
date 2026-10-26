---
'@astryxdesign/core': patch
---

[fix] BaseTypeahead, and the Typeahead, Tokenizer and PowerSearch menus built on it: an option now takes the highlight when the pointer moves over it, not when it merely appears under a resting pointer. A menu opened from the keyboard, or one that scrolls during arrow-key navigation, used to hand its highlight to whichever option slid under the cursor, so Enter could pick an option the user never pointed at and arrow keys appeared to jump back. The keyboard highlight now stays put until the pointer actually moves.

@ejhammond
