---
'@astryxdesign/cli': patch
---

[fix] `astryx init --user` on a skills folder you cannot write (such as a read-only `~/.agents/skills`) now fails with `ERR_WRITE_FAILED` and a message that names the path, the reason, and what to change, instead of a bare `EACCES` line with `ERR_UNKNOWN`.

@josephfarina
