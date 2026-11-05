---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[docs] Internationalization gains a short Other calendars guide: choose a calendar on `InternationalizationProvider` or `Calendar`, values stay Gregorian ISO dates, and most calendars need `Temporal` (load `temporal-polyfill/full/global` where it is missing). A new `astryx docs calendars` namespace has the detail: the supported calendars, loading `Temporal` on the server and in the browser, why the lunisolar calendars (`chinese`, `dangi`) can differ by a day between runtimes, and ISO 8601 week numbers. The guide and `Calendar`'s `calendar` prop docs say how to get identical server and browser markup for those calendars: `installImplementation()` from `temporal-polyfill/full/shim` on both sides, since the `full/global` import keeps a native `Temporal`.

@nynexman4464
