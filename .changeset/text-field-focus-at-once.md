---
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
---

[fix] TextInput, TextArea, NumberInput, DateInput, DateRangeInput, DateTimeInput, TimeInput, Tokenizer, Typeahead, PowerSearch, ChatComposer and RichTextEditor: when the primary pointer is coarse (a phone or tablet), the focus look shows at once, with no fade, so a tapped field repaints once while the keyboard rises. With a fine primary pointer, such as a mouse, a click and the Tab key keep the fade. ChatComposer's focus depth also shows at once under reduced motion, as the other fields' focus look already does.

@vjeux
