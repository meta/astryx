---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` warns when a setting of an added local theme does not show as written (a later shorthand resets it, a more specific rule of the theme it extends wins, or cascade order decides), naming the theme, the setting with its line, and the fix, from the same check `astryx theme build` runs. It is a warning, never a failure: the theme builds as before.

@josephfarina
