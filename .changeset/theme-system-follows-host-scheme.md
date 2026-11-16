---
'@astryxdesign/core': patch
'@astryxdesign/build': patch
---

[fix] A `Theme` in `system` mode now takes the light or dark scheme of the page around it. A host that draws the page dark, such as an artifact viewer in its dark theme, now gets the dark theme inside the `Theme` too; before, everything inside it followed the device's setting, so a reader on a light device saw dark text on the host's dark page. Under a `Theme` that forces light or dark, a `system` Theme still follows the device. Core's stylesheet (`astryx.css`, and the stylesheet a source build emits) now sets the page root to follow light or dark itself, so an app without `reset.css` keeps following the device.

@josephfarina
