---
'@astryxdesign/core': patch
---

[fix] `Calendar` day buttons grow with their numbers when the text size grows (as under iOS Dynamic Type). Their size is now a minimum, so a day's number stays inside its own tap target and a tap no longer lands on the day below. At the default text size nothing changes.

@cixzhang
