'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Hook docs for `useCalendarNavigation`, so `astryx hook useCalendarNavigation` and `astryx search` return it, and a `useCalendarNavigation — Custom Month Header and Grid` example block: Previous/Next buttons and the hook's month-year label over a day grid, where arrow keys move focus day by day and crossing a month edge flips the month and lands focus on the neighbor's edge day through pendingFocus.
