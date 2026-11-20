---
'@astryxdesign/core': patch
---

[docs] The README's setup box now shows how to install the CLI at the version of `@astryxdesign/core` you have, saved exactly when `package.json` pins Core exactly, and its link to the Astryx CLI section now works. A second box tells agents to ask the Astryx CLI before they write code, with three commands that work with or without the install: `build`, `component` and `doctor --built .`. Before, the setup box's command installed the newest CLI with a `^` range.

@josephfarina
