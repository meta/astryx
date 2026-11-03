---
'@astryxdesign/core': patch
---

[feat] DateInput, DateTimeInput: never show the native date control in a calendar it cannot show. With a `calendar` other than `gregory` or `iso8601`, such as `'persian'` or `'hebrew'`, `adaptive-native` (the default), the deprecated `nativePicker` values, and `presentation="native"` use the calendar popover on a mouse and the bottom sheet on a touch screen, because the native date control shows only Gregorian dates. An explicit `presentation="native"` also warns in development. A provider locale with an explicit `-u-ca-` keyword selects the calendar the same way, because the keyword asks for it; `calendar="gregory"` keeps the native control. The bottom sheet still shows Gregorian months. Values stay Gregorian ISO dates. Without `Temporal`, calendars other than `gregory`, `iso8601`, `buddhist`, `roc`, and `japanese` show Gregorian dates and the native control as before.

@nynexman4464
