---
'@astryxdesign/core': patch
---

[fix] Tokenizer, Typeahead and PowerSearch draw the on-field status icon, as TextInput does. With `statusVariant="tooltip"` the icon is a button that shows the status message on hover, keyboard focus or a tap; before, sighted people saw only the border tint and never the message.

@josephfarina
