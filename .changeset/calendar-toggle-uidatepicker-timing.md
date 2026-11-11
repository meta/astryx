---
'@astryxdesign/core': patch
---

[feat] Under a finger, the calendar in the DateInput and DateTimeInput bottom sheets now toggles to its month and year wheels like the iOS date picker:

- The month/year toggle cross-fades over `--duration-medium-min` (225 ms in the neutral theme, the token nearest iOS's 0.25 s there), where DateInput used a quick linear fade and DateTimeInput an instant swap. The wheels arrive on the theme's entrance curve and leave on its exit curve. In both sheets the wheels fade over the calendar, which stays drawn beneath them. As in UIKit, the header's month arrows and Reset and the footer's buttons take no tap during the fade, and a second tap on the title turns it around.
- The title's chevron points along the reading direction and turns a quarter turn to point down while the wheels show, on the theme's move curve. In DateInput it was a down chevron that flipped up; in DateTimeInput it was a down chevron that stayed still.
- A finger's tapped day takes its selection at once, with no colour transition. A mouse or pen pick keeps the fade, in the touch sheet too.

With a mouse or a pen, the toggle stays as it is.

When the title or Done toggles with keyboard focus in the outgoing panel, focus moves into the incoming one, with any pointer. In DateTimeInput, Done lands on the shown month's day.

With Reduce Motion on, nothing travels: under a finger the toggle cross-fades in 200 ms, and the chevron dips instead of turning, its turn landing mid-dip. With a mouse it changes at once.

@vjeux
