---
'@astryxdesign/core': patch
---

[feat] TimeInput, DateTimeInput: the `hourFormat` default follows the locale. This is a default change. The old default was always `'12h'`; the new default, when `hourFormat` is unset, is the `InternationalizationProvider` locale's hour cycle, so a `de-DE`, `en-GB`, or `vi-VN` app shows "14:30" like `Timestamp` beside it, while `en-US` and an app with no provider keep "2:30 PM". To keep the old default, pass `hourFormat="12h"`. To honor a person's own 12/24-hour preference everywhere, put it on the provider locale (`en-US-u-hc-h23`). Twelve-hour text now uses the locale's own day period ("오후 2:30", "午後2:30", "2:30 p. m.") instead of a fixed English AM/PM, along with its digits and separator, and the typed field reads that text back. Fixes #8992.

@nynexman4464
