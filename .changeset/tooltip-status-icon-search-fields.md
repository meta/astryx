---
'@astryxdesign/core': patch
---

[fix] Tokenizer, Typeahead and PowerSearch draw the on-field status icon, as TextInput does. With `statusVariant="tooltip"` the icon is a button that shows the status message on hover, keyboard focus or a tap; before, sighted people saw only the border tint and never the message. In the sheet presentation a tap on the plain icon opens the sheet, as a tap on the tokens does. With `tokenOverflowBehavior="unfocusedLayer"`, the icon shows once the field opens.

@josephfarina
