---
'@astryxdesign/core': patch
---

[fix] Field inputs (TextInput, TextArea, NumberInput, Selector, MultiSelector, Typeahead, Tokenizer, and the date and time inputs) now show keyboard focus under forced colors, such as Windows High Contrast. Forced colors drop the inset focus shadow and repaint every border in one system color, so a focused field looked the same as one at rest. A focused field's border now takes the system Highlight color there, with or without a status. Nothing changes outside forced colors.

@cixzhang
