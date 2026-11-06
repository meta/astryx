---
'@astryxdesign/core': patch
---

[docs] FieldStatus: the guidance now says that a field's status is announced when its message or type changes, not again when a repeated submit fails with the same errors, and shows how the form announces such a repeated submit, with unchanged errors, once with `useAnnounce` (the error count and the first error) and moves focus to the first invalid field. (#10122)

@cixzhang
