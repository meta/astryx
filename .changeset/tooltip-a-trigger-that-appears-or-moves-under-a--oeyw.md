---
'@astryxdesign/core': patch
---

[fix] Tooltip, Text, Heading: a trigger that appears or moves under a mouse or pen that does not move opens no tooltip, as after a click that opens a dialog whose close button lands under the pointer. This includes the full-text tooltip of truncated Text and Heading. The show delay starts on the first move over the trigger. A pointer that moves onto the trigger opens the tooltip as before, in Chromium, Firefox and WebKit. The same holds after a scroll brings a trigger under a still mouse, once the mouse has moved since the trigger appeared on the page. A test that opens a tooltip with a bare `mouseEnter` now has to send a move too.
@shashank03-dev
