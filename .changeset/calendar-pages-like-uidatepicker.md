---
'@astryxdesign/core': patch
---

[fix] Under a finger, the calendar in the DateInput and DateTimeInput bottom sheets now pages its months like the iOS date picker:

- A swipe moves at most one month, chosen at the lift by iOS's paging rule: a quick flick, or a drag past half a month. It settles on iOS's paging curve.
- The month title follows the drag and the settle. It changes when the next month is more than half in view.
- An arrow scrolls one month. A second tap mid-scroll goes on to the month after.
- In the sheet, a drag is decided once it has moved 10 px either way. It pages the calendar if it has moved 10 px sideways by then, and moves the sheet otherwise.
- A horizontal trackpad swipe moves the calendar with it and pages at the release, like a drag.
- With Reduce Motion on, the arrows' step and a swipe's settle cross-fade in 200 ms instead of travelling.

With a mouse, the calendar still scrolls natively. With any pointer, PageUp and PageDown now move the keyboard focus by a month, and by a year with Shift.

@vjeux
