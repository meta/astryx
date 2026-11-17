---
'@astryxdesign/core': patch
---

[fix] A `Theme` in `system` mode now takes the light or dark scheme of the page around it. A host that draws the page dark, such as an artifact viewer in its dark theme, now gets the dark theme inside the `Theme` too; before, everything inside it followed the device's setting, so a reader on a light device saw dark text on the host's dark page. `useTheme()` and `useSyntaxTheme()` report the same mode, so charts and canvas match: a `system` Theme resolves to the scheme the page root names (light when it names none), else the device's setting, and under a `Theme` that forces light or dark it follows the device. If your app sets the page root's `color-scheme` to `light` or `dark` itself, that setting now decides what a `system` Theme shows. `useSyntaxTheme()` also follows a `Theme` that forces light or dark, as code blocks do. `reset.css` makes the page root follow the device's light or dark setting. An app that does not load `reset.css` and sets no scheme on the page root stays light, Astryx content included, so an Astryx widget on a light page never turns dark; to follow the device there, import `@astryxdesign/core/reset.css`, or set `color-scheme: light dark` on `html`.

@josephfarina
