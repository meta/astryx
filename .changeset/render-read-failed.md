---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` and `--reverse` say that a file which is there but cannot be read cannot be read, with the reason (`EACCES: no permission`, or that it is a folder), and the new error code `ERR_READ_FAILED`. They used to say the file does not exist, with `ERR_FILE_NOT_FOUND`, which a file that is not there keeps.

@josephfarina
