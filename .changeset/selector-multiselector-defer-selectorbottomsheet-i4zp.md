---
'@astryxdesign/core': patch
---

[perf] Selector, MultiSelector: the bottom-sheet frame (`BottomSheet`, `Section`, `Heading` and the sheet markup) no longer loads with the page. A page using `Selector` loads about 4.3 KB less JavaScript (gzip) on first paint. A selector that presents its list as a bottom sheet (`presentation="bottom-sheet"`, or `adaptive` on a compact touch screen) loads the frame when a finger or pointer lands on the trigger, the trigger takes focus, or the list is asked to open. A tap made before the frame arrives opens the sheet once it does, with focus in the list, as before (#12018).

@MuhammadAusafJamal
@cixzhang
