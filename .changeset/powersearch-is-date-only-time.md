---
'@astryxdesign/core': patch
---

[fix] PowerSearch: a `date_absolute` operator with `isDateOnly: false` gets the time of day the option names. The edit popover shows a time field beside the date picker, the token shows the date and the time, and both read and write the instant in `timezoneID` when it is set, else the viewer's zone, so the time typed is the time shown. Before, `isDateOnly` was read nowhere: every `date_absolute` edited in the date picker and stored UTC midnight of the picked day. Only operators that set `isDateOnly: false` change: a value saved from their editor now carries the time entered where it carried midnight, and their token shows the time; `isDateOnly` unset or `true` is unchanged, and stored values are read as the instants they are.

@imdreamrunner
