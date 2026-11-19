---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` warns on a `{@link}` in a template's description that names no doc, and `doctor integration validate` lists it as a `next` note, so `integration check --strict` fails on it only from the next minor release.

@josephfarina
