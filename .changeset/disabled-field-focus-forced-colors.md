---
'@astryxdesign/core': patch
---

[fix] A disabled field that keeps its tab stop (TextInput, TextArea, NumberInput, Typeahead, Tokenizer, Selector, MultiSelector, and DateInput, TimeInput, DateRangeInput and DateTimeInput on every surface: popover, native and bottom sheet) now shows keyboard focus under forced colors, such as Windows High Contrast. Its focus border takes the system Highlight color there, as enabled fields' does. Nothing changes outside forced colors. (#9410)

@cixzhang
