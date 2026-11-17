---
'@astryxdesign/core': patch
---

[docs] Input docs say how to mark a form whose fields are mostly required: set `defaultOptionality="required"` on FormLayout and mark only the optional fields, instead of a "Required" tag after every label. TextInput's best practice now says so, and the `isRequired` description of each input that takes the form default points to it. CheckboxInput, CheckboxList and Switch take no required state from the form default, so their docs are unchanged.

@josephfarina
