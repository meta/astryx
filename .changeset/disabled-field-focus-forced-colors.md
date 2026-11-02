---
'@astryxdesign/core': patch
---

[fix] A disabled field that keeps its tab stop (TextInput, TextArea, NumberInput, Typeahead, Tokenizer, Selector, MultiSelector, DateInput, TimeInput) now shows keyboard focus under forced colors, such as Windows High Contrast. Its focus border takes the system Highlight color there, as enabled fields' does. Nothing changes outside forced colors.

@cixzhang
