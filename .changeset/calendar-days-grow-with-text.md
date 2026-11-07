---
'@astryxdesign/core': patch
---

[fix] `Calendar` day buttons grow with their numbers when the person's text size grows, such as a larger browser default font size. Their size is now a minimum, so a day's number stays inside its own tap target and a tap no longer lands on the day below. At the default text size nothing changes.

@cixzhang
