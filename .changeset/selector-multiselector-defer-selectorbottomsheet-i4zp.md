---
'@astryxdesign/core': patch
---

[perf] Selector, MultiSelector: a pointer `Selector` or `MultiSelector` (the default presentation on desktop and non-compact screens) no longer statically carries the bottom-sheet frame (`Section`, `Heading` and the sheet markup). The frame leaves the first load and loads with `BottomSheet` after the first client render when the bottom-sheet presentation is active. A page using `Selector` loads about 4.0 KB less JavaScript (gzip) on first paint. A selector with `presentation="bottom-sheet"`, or `adaptive` on a compact touch screen, loads its sheet chunk after mount and opens as before (#12018).

@MuhammadAusafJamal
