---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme` reads its cached part data once per change of the cache file instead of parsing it again for every command in a process. The per-user cache of transpiled TypeScript is not read again when it has grown until its oldest copy could be removed, so a large cache no longer slows every theme command's first load.

@josephfarina
