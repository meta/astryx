---
'@astryxdesign/core': patch
---

[fix] Typeahead, Tokenizer: picking a result now calls `onChangeQuery('')`. The pick empties the input but never reported it, so an app that mirrored the query kept the text typed before the pick. A pick made while the query was already empty reports nothing, as nothing changed. (#8929)

@HelloOjasMutreja
