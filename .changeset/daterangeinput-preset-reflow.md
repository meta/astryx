---
'@astryxdesign/core': patch
---

[fix] DateRangeInput: with `presets`, the popover overflowed a phone-width screen. The calendar was cut off on the right, so the Saturday column and the end of a selected range were hidden, and on screens under about 364 px Next month was out of reach too. Now, when the presets and a one-month calendar do not fit side by side, the presets stack above the calendar, and the calendar and its navigation stay inside the popover. On a short screen the popover's content scrolls. Where the presets fit beside a one-month calendar, the layout does not change.

@cixzhang
