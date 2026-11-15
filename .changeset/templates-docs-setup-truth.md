---
'@astryxdesign/cli': patch
---

[fix] The technical documentation page template now teaches the real setup. Its AI setup prompt no longer asks for a style compiler, which contradicted the article's own precompiled-CSS step, and its theming example uses the real `Theme` component from `@astryxdesign/core/theme` with a theme package instead of a `ThemeProvider` that Astryx does not export. Its prerequisites now name React 19 or later, which Core requires.

@josephfarina
