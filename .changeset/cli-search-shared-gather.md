---
'@astryxdesign/cli': patch
---

[perf] `search()` shares a catalog gather that is still running: searches that start together in one long-running process, such as a docs site's search right after it starts, now gather once instead of once each (#9460)
@cixzhang
