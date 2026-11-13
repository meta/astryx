---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor undo` refuses a file in place of the app's `themes` folder before checking the theme's files. On Node 22.13.0 it now reports `ERR_FILE_EXISTS` and suggests `ls -la themes`, instead of failing with a raw `ENOTDIR` error. Rename or move the file, then run the command again; the file is left unchanged.

@codebunny
