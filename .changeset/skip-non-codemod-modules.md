---
'@astryxdesign/cli': patch
---

[fix] Integration codemod discovery now identifies codemods by shape: a module under `codemods/<version>/` counts as a codemod only when it default-exports an object. A co-located helper (named exports only, or a default-exported function) is skipped instead of being fed to `parseCodemod` and failing the whole integration's discovery. A module that does default-export an object is still validated, so a broken codemod (missing field, no `type`) still fails loudly.

@gunjanjaswal
