---
'@astryxdesign/core': patch
---

[fix] PowerSearch: a date range filter's token now shows the days it covers, such as "Mar 9 – 10, 2024", instead of the words "date range". Its accessible label, the sheet's Filters row and the removal announcement read the same days, in `timezoneID` when it is set, else as UTC days, as the range editor reads them. A range that starts or ends at now, or a number of days back, shows the days it covers today.

@cixzhang
