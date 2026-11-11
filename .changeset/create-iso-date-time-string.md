---
'@astryxdesign/core': patch
---

[feat] DateTimeInput: `createISODateTimeString(value)` builds an `ISODateTimeString` from a string, such as a value loaded from storage or an API, without a cast. It returns `null` unless the trimmed input is `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS` with a date that exists and a time that `createISOTimeString` accepts. A time zone suffix is rejected, because the value is a wall-clock time. Before, the only way to get an `ISODateTimeString` from a string was `as ISODateTimeString`, which skips validation.

@bstcoc
