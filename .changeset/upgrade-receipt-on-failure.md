---
'@astryxdesign/cli': patch
---

[fix] A failed `astryx upgrade` now says which files it already changed. When a codemod or post-codemod hook fails, the upgrade still writes every other change; the `--json` error (`{"error", "code": "ERR_CODEMOD_FAILED"}`) now adds a `receipt` with the same fields a finished run returns (`modifiedFiles`, `errors`, `protectedFiles`, `complete: false`, `errorCode`), and the error `upgrade()` rejects with carries it as `receipt`. The change is additive: the error code, the error shape, `isError()`, the rejection and exit code 1 are unchanged. An error that stops the run after codemods have written files, such as an astryx.config that fails validation, carries a `receipt` too.

@ejhammond
