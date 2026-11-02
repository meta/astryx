---
'@astryxdesign/core': patch
---

[feat] Built-in date formats follow the calendar of the `InternationalizationProvider`. With `calendar="persian"`, or a `-u-ca-` keyword in the provider locale, Timestamp's `date`, `date_long`, `date_weekday`, and `date_time` formats, the full date in its hover card and accessible name, and PowerSearch date values are written in that calendar, the same one `Calendar` shows. `date_time` keeps its time of day. `time`, the relative formats, `system_*`, and `unix_seconds` do not change, and without a provider calendar every output stays the same. `formatFilterValue` from `@astryxdesign/core/PowerSearch/utils` takes an optional `calendar` argument that defaults to `'gregory'`. A calendar that needs `Temporal` shows Gregorian dates where the runtime lacks it, as the date components do.

@nynexman4464
