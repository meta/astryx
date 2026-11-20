---
'@astryxdesign/core': patch
---

[fix] A field with an error, warning or success status shows keyboard focus again. The status style replaced the whole field shadow, so the focus ring disappeared and a focused field with a status looked the same as an unfocused one. It now keeps the focus ring in TextInput, TextArea, NumberInput, Selector, MultiSelector, the date and time fields, Typeahead, Tokenizer and PowerSearch.

@josephfarina
