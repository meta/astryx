---
'@astryxdesign/core': patch
---

[fix] A picker wheel that stops on a value outside the bounds now settles on the nearest value inside them. Before, it bounced back to the value it started from. This applies to the wheels in the TimeInput, DateTimeInput and DateInput bottom sheets. For example, with `min="09:00"`, dragging the hour wheel from 10 to 7 settles on 9, as the iOS time picker does. A stop on a value inside the bounds is unchanged. Opening a sheet on a value outside the bounds commits nothing. When a bound changes a wheel's value while the sheet is open, as when the meridiem wheel turns past the maximum, that wheel turns onto the new value instead of jumping there. Under reduced motion, the wheel's own scrolls no longer glide. On a touch screen this travel, the step from an arrow key and a click on a row cross-fade, the rows landing while they are faded out; with a mouse or a trackpad they land at once, except the travel after a touch drag, which cross-fades on any screen.

@vjeux
