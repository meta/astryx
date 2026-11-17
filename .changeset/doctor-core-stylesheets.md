---
'@astryxdesign/cli': patch
---

[fix] `doctor` now says when an app does not load Core's component styles, `@astryxdesign/core/astryx.css`. In an app that uses Core's prebuilt styles, components render unstyled without them. Before, nothing caught it: the build, `doctor` and `doctor --built` all passed. Plain `doctor` warns when no project stylesheet or module imports them and no page links them. `doctor --built` warns when the output uses Astryx but no built stylesheet or page carries them. An app that compiles Core's styles from source with `@astryxdesign/build` is not checked.

@josephfarina
