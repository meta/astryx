---
'@astryxdesign/core': patch
---

[fix] parseDateInput returns null when native Date fills in a missing year, instead of the year-2001 date that Chrome's Date parsing gives for text with no year, such as "meeting 3" or "Jan. 5", which DateInput then committed on Enter or blur. Text with a short or one-digit year ("Jan 5, 26", "1/1/1") or an explicit zone ("Jan 1, 2002 00:30 GMT") still parses.
@cpruijsen
