---
'@astryxdesign/core': minor
---

[breaking] A `-u-ca-` keyword in the `InternationalizationProvider` `locale` selects the calendar when the provider has no `calendar` prop. `th-TH-u-ca-buddhist` now shows Buddhist years in `Calendar`, `DateInput`, `DateRangeInput`, and `DateTimeInput`, where it showed Gregorian dates before. A component's `calendar` prop and the provider's `calendar` prop still take precedence. The keyword `islamic` resolves to `islamic-tbla`, as ECMA-402 resolves it; a `calendar="islamic"` prop stays an unknown identifier. A keyword outside `CalendarSystem` resolves to Gregorian and warns once in development. A locale without the keyword, such as `fa-IR`, still shows Gregorian dates. Date values stay Gregorian ISO strings.

**Migration:** Set `calendar="gregory"` on `InternationalizationProvider` to keep Gregorian dates when its `locale` carries a `-u-ca-` keyword.

@nynexman4464
