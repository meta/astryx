---
'@astryxdesign/cli': patch
---

[docs] Internationalization gains a short Other calendars guide: choose a calendar on `InternationalizationProvider` or `Calendar`, values stay Gregorian ISO dates, and most calendars need `Temporal` (load `temporal-polyfill/full/global` where it is missing). A new `astryx docs calendars` namespace has the detail: the supported calendars, loading `Temporal` on the server and in the browser, why the lunisolar calendars (`chinese`, `dangi`) can differ by a day between runtimes, and ISO 8601 week numbers.

@nynexman4464
