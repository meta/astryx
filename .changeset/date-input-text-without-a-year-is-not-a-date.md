---
'@astryxdesign/core': patch
---

[fix] parseDateInput returns null for text with no year that Chrome's Date parsing reads as a 2001 date, such as "meeting 3" or "9 Nov 10:00", which DateInput committed on Enter or blur. Text with a standalone 1 or 01, such as "hello 1" or "9 Nov 10:01", still gets a 2001 date. Text with a short or one-digit year ("Jan 5, 26", "1/1/1") or an explicit zone ("Jan 1, 2002 00:30 GMT") still parses.
@cpruijsen
