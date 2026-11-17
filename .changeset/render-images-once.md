---
'@astryxdesign/cli': patch
---

[experimental] A page rendered with `astryx experimental render` carries one copy fewer of each image it imports. The page's script reads such an image from the file's embedded source, which carries it already, so the script holds no copy of its own.

@josephfarina
