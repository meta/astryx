---
'@astryxdesign/core': patch
---

[fix] DateInput, DateTimeInput, DateRangeInput: in the Chinese and Dangi calendars, the bottom sheet's month labels and the range trigger text include the related Gregorian year, as the date field's text does, so `ja` writes `2026年九月` where it wrote `丙午年九月`.

@nynexman4464
