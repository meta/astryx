---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle` now copies the private attribute owner modules a component imports, and the unexported style modules they need, beside the copy in the package's layout. A swizzled `Item`, `CheckboxList`, `RadioList` or `TreeList` no longer imports a `privateAttributes/*.stylex` subpath that `@astryxdesign/core` does not export. A second swizzle reuses an identical copy and refuses a changed one without `--overwrite`. The receipt's `files` and `filesCopied` include the modules it copied.

@cixzhang
