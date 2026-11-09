---
'@astryxdesign/core': patch
---

[perf] Under snap paging, a Carousel's release bakes the settle's keyframes once, not once per item, and plays the settle only on the items that can show. With 9 items the release takes about a third less main-thread time, and with 30 items about two thirds less.

@vjeux
