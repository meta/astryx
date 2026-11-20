---
'@astryxdesign/cli': patch
---

[fix] A manifest key the running CLI does not know is no longer an integration issue. Everyday commands stop printing "has 1 integration issue(s)" for an integration published against a newer CLI, and project `doctor` no longer lists it. `doctor integration validate` and `integration check` list it as an `unknown_manifest_key` note, which fails nothing; a key one letter from a known one is a `next` note with its fix.

@josephfarina
