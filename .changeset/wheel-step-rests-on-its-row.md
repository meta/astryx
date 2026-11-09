---
'@astryxdesign/core': patch
---

[fix] With a mouse or trackpad, a date or time sheet's wheel no longer turns back to the row a key step is leaving. A key step commits its row at once and then scrolls there. On a busy page or a slow device the scroll could draw no frame for longer than the wheel's quiet period, or the browser could end it part-way, and the wheel took that pause for rest: it committed the row under the band and turned back there. A rest before the step's row is reached now finishes the scroll instead. A scroll a person makes still rests where it stops.

@vjeux
