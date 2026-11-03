---
'@astryxdesign/core': patch
---

[feat] DateInput, DateTimeInput: the bottom sheet shows the calendar. With a `calendar` such as `'persian'`, `'hebrew'`, or `'japanese'`, the bottom sheet shows months of the calendar, with its month names and the locale's digits, in panes of one fixed height, and its closed field writes the date in the calendar. Its month wheel lists the months of the selected calendar year, including leap months such as Adar I and Adar II, and a year change keeps the month or moves to its common counterpart (Adar I becomes Adar). Year labels carry the era, such as `令和8`, and a year in which the era changes is labeled with the era of the shown month, as on iOS: 2019 reads `平成31` in January and `令和元` in July, and the month heading follows the same date, so January 3, 1989 reads `昭和64年1月`. A provider locale with an explicit `-u-ca-` keyword selects the calendar too, because the keyword asks for it; `calendar="gregory"` keeps the Gregorian sheet. Values stay Gregorian ISO dates.

@nynexman4464
