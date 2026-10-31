---
'@astryxdesign/core': patch
---

[fix] TextArea, Typeahead and Tokenizer: a caller's `aria-labelledby` no longer replaces the field's own label. Before, it was the only name the control had, so `label="Notes" aria-labelledby="billing-heading"` named the textarea "Billing". Now the caller's ids follow the field's own label ("Notes Billing"), as TextInput, NumberInput, Selector and MultiSelector already do. A Typeahead inside an InputGroup, which ignored the caller's ids altogether, is now named by the group, its label, then the caller's ids. The visible label stays in the accessible name (WCAG 2.2 SC 2.5.3 Label in Name; `family:input-fields` FR10.1). Fields without a caller `aria-labelledby` are unchanged. No API changes.

@HelloOjasMutreja
