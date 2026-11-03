---
'@astryxdesign/core': patch
---

[feat] DateRangeInput: show the range in the calendar. DateRangeInput takes a `calendar` prop, such as `'persian'` or `'hebrew'`, defaulting to the `InternationalizationProvider` calendar (an explicit `-u-ca-` keyword in the provider locale counts, and `calendar="gregory"` keeps Gregorian), and writes its trigger text and shows its popover calendar in it. Values stay Gregorian ISO dates. Without `Temporal`, calendars other than `gregory`, `iso8601`, `buddhist`, `roc`, and `japanese` show Gregorian dates.

@nynexman4464
