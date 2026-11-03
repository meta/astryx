---
'@astryxdesign/core': patch
---

[feat] Built-in date formats follow the calendar of the `InternationalizationProvider`. With `calendar="persian"`, or a `-u-ca-` keyword in the provider locale, Timestamp's `date`, `date_long`, `date_weekday`, and `date_time` formats, the full date in its hover card and accessible name, and PowerSearch date values are written in that calendar, the same one `Calendar` shows. An explicit `-u-ca-` keyword in the provider locale asks for its calendar, so those dates change too; set `calendar="gregory"` to keep Gregorian. `date_time` keeps its time of day. `time`, the relative formats, `system_*`, and `unix_seconds` do not change, and without a provider calendar every output stays the same. `formatSharedDate` from `@astryxdesign/core/utils` and `formatFilterValue` from `@astryxdesign/core/PowerSearch/utils` take an optional trailing `calendar` argument that defaults to `'gregory'`. A calendar that needs `Temporal` shows Gregorian dates where the runtime lacks it, as the date components do.

@nynexman4464
