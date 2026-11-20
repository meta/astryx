---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor undo` refuses a `themes` that is a file, not a folder, by name on Node 22.13 too ("themes in this app is a file, not a folder …", with `ls -la themes` to see what is there). Before, on the CLI's oldest supported Node, it stopped with a raw "ENOTDIR: not a directory" error instead.

@cixzhang
