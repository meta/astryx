---
'@astryxdesign/core': patch
---

[fix] `Calendar` and `useCalendarNavigation` keep moving the visible month when `onFocusDateChange` is given without `focusDate`. The focus date is controlled only when both props are present, as the imperative `navigateTo` handle already treated it; but the Previous/Next buttons and keyboard month crossing switched on the callback alone, so a listener-only calendar reported the new month and then stayed on the old one, with no way to move. The callback still fires in every mode.

@thecodebasedot
