---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle` reports `ERR_WRITE_FAILED` when its output path is a file on the minimum supported Node version. The original file stays unchanged, and the error identifies the failed write relative to the project instead of exposing a cleanup error.

@astracat-bot
