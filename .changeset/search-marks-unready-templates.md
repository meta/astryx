---
'@astryxdesign/cli': patch
---

[feat] Every template result in `astryx search --json`, and every page and block in `astryx build --json`, adds `isReady`: false for a template whose doc sets `isReady: false`, else true. In text, `astryx search` marks an unready template's kind `(not ready)`, and `astryx template --list` marks it `(not ready)` instead of `(WIP)`. Search still lists it in the same place.

@josephfarina
