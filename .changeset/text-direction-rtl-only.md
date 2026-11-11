---
'@astryxdesign/core': patch
---

[fix] `InputGroupText`, `Badge` and `Token` add their left-to-right direction mark to plain text only on a right-to-left page (the direction `InternationalizationProvider` sets). Left-to-right pages render the same markup as before that mark existed. Nothing changes on screen.

@cixzhang
