---
'@astryxdesign/core': patch
---

[feat] Search fields ask a touch keyboard for its Search key and no autocorrection. The search inputs of Typeahead, Tokenizer (and so PowerSearch), CommandPaletteInput and the Selector and MultiSelector search row now carry `enterkeyhint="search"` and `autocorrect="off"`. A phone keyboard then shows a Search key instead of Return and leaves names and identifiers as typed. The key is only a label: Enter does what it did before in each field.

@vjeux
