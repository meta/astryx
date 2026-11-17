---
'@astryxdesign/cli': patch
---

[fix] A long-running CLI process reads a family doc or a theme or icon descriptor again when npm replaces it with a file of the same size and modification time, and reads the theme part data cache again when it is rewritten in place with the same size and modification time.

@josephfarina
