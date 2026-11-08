---
'@astryxdesign/core': patch
---

[fix] a month position past the end of a Gregorian-aligned calendar's year constrains to that year's last month in calendarMonthFromYearMonth and useCalendarDays, instead of returning a NaN CalendarMonth and laying out the next year's January (#10461)
@aashish254
