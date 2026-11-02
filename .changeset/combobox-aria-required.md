---
'@astryxdesign/core': patch
---

[fix] `Typeahead` and `Tokenizer` expose their state on the combobox (WCAG 2.2 SC 4.1.2; `component:FormLayout` FR5 and AR2). Before, the combobox had no `aria-required`, so under `FormLayout defaultOptionality="required"`, where the visible "Required" marker is hidden, a screen reader announced a required field as optional; and an error status showed its message with no `aria-invalid`. Now the combobox sets `aria-required` for the resolved required state and `aria-invalid` for an error status. A caller's own `aria-required` or `aria-invalid` still applies when the field's own state is off.

@cixzhang @duytbp
