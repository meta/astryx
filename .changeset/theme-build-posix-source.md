---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` writes the `Source:` line of its generated header with forward slashes on every platform. On Windows it used backslashes, so `astryx theme build --check` reported every output built on macOS or Linux as out of date, and a rebuild on Windows rewrote the header of every generated file.

@prath47
