---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --out` accepts an absolute path in any folder, such as a folder of files to upload as an artifact. The render still never replaces a file it did not write. A relative `--out` still stays inside the current folder, and its refusal now says that an absolute path works.

@josephfarina
