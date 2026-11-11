---
'@astryxdesign/core': patch
---

[feat] Popover `isModal` now decides whether the popover holds focus. `isModal` (the default) is unchanged: Tab and Shift+Tab cycle inside the open popover, and a dialog popover carries `aria-modal`. `isModal={false}` holds nothing. Tab moves from the anchor or trigger into the popover and on to what follows it, and Escape closes the popover only while focus is inside it or on its anchor or trigger. Use it for a coachmark or a tour step that lets the person reach the control it describes. On a compact touch screen, a non-modal popover presents a sheet with no scrim. **Behavior change:** before, `isModal={false}` removed only `aria-modal` and still kept Tab inside the popover. If a popover needs Tab held, leave `isModal` at its default.

@nynexman4464
