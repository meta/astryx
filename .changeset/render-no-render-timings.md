---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` draws some large chart pages faster: React no longer logs each render's timing while the export draws them. A page of four charts of 50,000 points each took 42 s to render and now takes 29 s; most pages take the same time as before. The file it writes is the same.

@josephfarina
