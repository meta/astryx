---
'@astryxdesign/cli': patch
---

[fix] `theme add` of a theme with one color mode: when the theme's built module exports `colorModes` (`["light"]` or `["dark"]`, which `theme build` writes when the theme source exports it), the `theme.app` receipt gives that theme a `mode` field, the generated theme module lists it in a `themeModes` export, and the first import's wiring passes `mode={themeModes[defaultThemeSlug]}` to `Theme`, so a light-only theme no longer shows a dark half it lacks on a system set to dark, and after `theme use` of a theme with both modes the app follows the system again. A project whose themes all have both modes gets the same receipt, module and wiring as before; a project wired before this change keeps its wiring, so its app still follows the system.

@josephfarina
