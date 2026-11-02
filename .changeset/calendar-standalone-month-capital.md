---
'@astryxdesign/core': patch
---

[fix] Calendar, DateInput, DateTimeInput: a month label that stands alone starts with a capital where the locale capitalizes one. In Spanish, French, Italian, Dutch, Polish, Russian and Ukrainian, Calendar's heading read "octubre de 2026"; it now reads "Octubre de 2026", following CLDR's stand-alone capitalization, as the weekday headers already use CLDR's stand-alone names. A two-month view capitalizes both months, and each month grid's name, the touch date fields' month headings and `useCalendarNavigation`'s `monthYearLabel` do the same. Dates in running text, such as a field's value, are unchanged, and so is every locale CLDR does not capitalize, Vietnamese included.

@cixzhang
