---
'@astryxdesign/core': patch
'@astryxdesign/build': patch
---

[fix] A `Theme` in `system` mode now takes the light or dark scheme of the page around it. A host that draws the page dark, such as an artifact viewer in its dark theme, now gets the dark theme inside the `Theme` too; before, everything inside it followed the device's setting, so a reader on a light device saw dark text on the host's dark page. `useTheme()` and `useSyntaxTheme()` report the same mode, so charts and canvas match: a `system` Theme resolves to the scheme the page root names, else the device's setting, and under a `Theme` that forces light or dark it follows the device. If your app sets the page root's `color-scheme` to `light` or `dark` itself, that setting now decides what a `system` Theme shows. `useSyntaxTheme()` also follows a `Theme` that forces light or dark, as code blocks do. Core's stylesheet (`astryx.css`, and the stylesheet a source build emits) now sets a root with no forced mode to follow light or dark itself, so an app without `reset.css` keeps following the device.

@josephfarina
