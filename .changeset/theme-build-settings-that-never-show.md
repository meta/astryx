---
'@astryxdesign/cli': patch
---

[feat] `astryx theme build` warns about a component setting of a theme's page rules that the browser does not show as written, for each setting a key of the theme's own file (or a local theme it extends) writes, also through a call, a const or a spread; settings a helper function builds or a module the theme imports writes, its onDark and onLight surfaces and its adaptation rules are not read. It names one a later shorthand resets (a `border` after the block's own `borderTopColor`, or a second key that builds the same rule), one a more specific rule of the theme it extends beats on a variant, and one whose order against such a rule (or the theme's own variant of it) decides what shows where both hold. A rule for a runtime state alone (`:hover`, `selected`) is the look of that state and never counts. Each warning names the setting's line, the rule that wins and the change that makes it show, and the receipt lists them in `settingIssues`. The output is the same as before.

@josephfarina
