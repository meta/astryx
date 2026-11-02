---
'@astryxdesign/core': patch
---

[fix] DateRangeInput: with `presets`, the popover overflowed a phone-width screen. The calendar was cut off on the right, so Saturday, the end of a selected range and Next month were out of reach. Now, when the presets and the calendar do not fit side by side, the presets stack above the calendar, and the calendar and its navigation stay inside the popover. When they fit, the layout does not change.

@cixzhang
