---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` and `--reverse` say that a file they cannot read cannot be read, with the reason (`EACCES: no permission`, a folder or a pipe given as the file), and the new error code `ERR_READ_FAILED`. They used to say the file does not exist, with `ERR_FILE_NOT_FOUND`, which a file that is not there keeps.

@josephfarina
