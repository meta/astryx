---
'@astryxdesign/core': patch
---

[feat] DateTimeInput: `createISODateTimeString(value)` builds an `ISODateTimeString` from a string, such as a value loaded from storage or an API, without a cast. It returns `null` unless the trimmed input is `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS` with a date that exists in year 0001 or later and a time that `createISOTimeString` accepts: one- or two-digit time fields and an optional seconds fraction, which is dropped (`2026-01-28T9:5` gives `2026-01-28T09:05`). A time zone suffix is rejected, because the value is a wall-clock time. Before, the only way to get an `ISODateTimeString` from a string was `as ISODateTimeString`, which skips validation.

@bstcoc
