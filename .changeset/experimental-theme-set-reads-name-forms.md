---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a part typed as a form of its own name (another case, spaces for its dashes, its plural, its class or component name, such as `--on icons` or `--on "text inputs"`) is now set on that part instead of refused, and the result says what was read ("read `icons` as `icon`"). A bare `mode light` or `mode dark` now sets `light-only` or `dark-only` in the same way. A misspelt or unclear name still refuses, with the line that works.

@josephfarina
