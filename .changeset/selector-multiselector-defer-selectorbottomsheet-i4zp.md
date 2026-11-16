---
'@astryxdesign/core': patch
---

[perf] Selector, MultiSelector: a pointer `Selector` or `MultiSelector` (the default presentation on desktop and non-compact screens) no longer statically carries `SelectorBottomSheet` or its sheet frame. `Selector` and `MultiSelector` now defer `SelectorBottomSheet` behind a lazy presentation host that preloads when the bottom-sheet presentation is active and mounts only when opened. A page using `Selector` loads about 3.8 KB less JavaScript (gzip) on first paint. A selector with `presentation="bottom-sheet"`, or `adaptive` on a compact touch screen, preloads its sheet chunk when active and opens as before (#12018).

@MuhammadAusafJamal
