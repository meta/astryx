---
'@astryxdesign/core': patch
---

[fix] A press inside a Typeahead's or Tokenizer's own field no longer closes its open list. Clicking between two letters to fix a typo moves the caret and keeps the matches showing; a press anywhere else on the page still closes the list, and Escape still does.

@duytbp
