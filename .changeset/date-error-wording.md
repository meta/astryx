---
'@astryxdesign/core': patch
---

[fix] DateInput, DateTimeInput: a typed date that the calendar does not have, such as February 30, shows "Enter a real date". The message names the calendar, as in "Enter a real date (Persian Calendar)", only when the field's calendar differs from the `InternationalizationProvider` calendar. A day that `dateConstraints` rules out shows "Enter an available date".

@nynexman4464
