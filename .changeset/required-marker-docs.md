---
'@astryxdesign/core': patch
---

[docs] Input docs say how to mark a form whose fields are mostly required: set `defaultOptionality="required"` on FormLayout and mark only the optional fields, instead of a "Required" tag after every label. TextInput's best practice now says so, and each input's `isRequired` description points to it.
