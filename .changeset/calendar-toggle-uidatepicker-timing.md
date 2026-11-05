---
'@astryxdesign/core': patch
---

[feat] Under a finger, the calendar in the DateInput and DateTimeInput bottom sheets now toggles to its month and year wheels like the iOS date picker:

- The month/year toggle cross-fades over the theme duration token nearest iOS's 0.25 s (`--duration-medium-min`), where DateInput used a quick linear fade and DateTimeInput an instant swap. The wheels arrive on the theme's entrance curve and leave on its exit curve. As in UIKit, the header's month arrows and Reset and the footer's buttons take no tap during the fade, and a second tap on the title turns it around.
- The hidden month/year wheels are laid out once the sheet settles, so the fade shows from near its start.
- The title's chevron points along the reading direction and turns a quarter turn to point down while the wheels show, on the theme's move curve. In DateInput it was a down chevron that flipped up; in DateTimeInput it was a down chevron that stayed still.
- A finger's tapped day takes its selection at once, with no colour transition. A mouse or pen pick keeps the fade, in the touch sheet too.

With a mouse or a pen, the toggle stays as it is.

In DateTimeInput, when Done closes the wheels with focus in them, the keyboard focus moves to the shown month's day, with any pointer.

With Reduce Motion on, nothing travels: under a finger the toggle cross-fades in 200 ms, and the chevron dips instead of turning, its turn landing mid-dip. With a mouse it changes at once.

@vjeux
