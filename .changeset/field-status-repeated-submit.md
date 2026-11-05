---
'@astryxdesign/core': patch
---

[docs] FieldStatus: the guidance now says that a field's status is announced when its message or type changes, not again when a repeated submit fails with the same errors, and shows how the form announces a failed submit once with `useAnnounce` (the error count and the first error) and moves focus to the first invalid field.

@cixzhang
