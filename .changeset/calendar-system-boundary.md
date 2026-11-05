---
'@astryxdesign/core': patch
---

[feat] InternationalizationProvider takes a `calendar` prop (`CalendarSystem`, exported from `@astryxdesign/core/i18n`), such as `'persian'`, `'hebrew'`, `'islamic-umalqura'`, or `'buddhist'`, and exposes the resolved calendar on `InternationalizationContext` as `calendar`. A locale never selects the calendar: `fa-IR` resolves to Gregorian until you set `calendar="persian"`, and a provider locale with a `-u-ca-` keyword, such as `th-TH-u-ca-buddhist`, keeps Gregorian dates; set `calendar` to choose one. An unknown identifier resolves to Gregorian and warns once in development. The Gregorian-aligned calendars (`gregory`, `iso8601`, `buddhist`, `roc`, `japanese`) work everywhere; the others need `Temporal`. The context keeps the requested calendar; where `Temporal` is missing, a date component that resolves it shows Gregorian dates and warns once in development. Astryx date components keep showing Gregorian dates, and date values stay Gregorian ISO strings.

@nynexman4464
