---
'@astryxdesign/core': patch
---

[feat] Search fields set up a touch keyboard the way iOS search bars do: a Search key, and no autocorrection. The inputs of Typeahead, Tokenizer, PowerSearch, CommandPaletteInput and the search row of Selector and MultiSelector now carry `enterkeyhint="search"` and `autocorrect="off"`, so an iPhone keyboard shows a Search key (a magnifier on iOS 26) instead of Return and leaves typed names and terms as typed. The key is only a label: Enter still does what it did before in each field.

@vjeux
