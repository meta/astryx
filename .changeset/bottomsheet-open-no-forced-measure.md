---
'@astryxdesign/core': patch
---

[perf] BottomSheet: opening a sheet no longer forces a layout to measure its height while it mounts; the sheet reads its height from the browser's own layout instead. On a phone-sized page with a 4× slowed CPU, a Selector's sheet shows its first frame about one frame sooner (about 110 ms to 94 ms after the tap) and the open does about 7 ms less forced layout. The open motion and the sheet's size are unchanged.

@cixzhang
