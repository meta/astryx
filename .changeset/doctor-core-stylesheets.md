---
'@astryxdesign/cli': patch
---

[fix] `doctor` now says when an app does not import Core's component styles, `@astryxdesign/core/astryx.css`. Without them, Astryx components render unstyled. Before, nothing caught it: the build, `doctor` and `doctor --built` all passed. Plain `doctor` warns when no project source or stylesheet imports them. `doctor --built` fails when the output uses Astryx but no built stylesheet or page carries them.

@josephfarina
