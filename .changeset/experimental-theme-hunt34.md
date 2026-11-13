---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a render that fails in `show` (two copies of React, a component that throws) is refused with `doctor` and "Nothing was written" wherever it happens; outputs that `show` made again are put back first. Two copies of React are now named as the cause (Core's own React is found from its entry). In a workspace whose root does not use `@astryxdesign/core` (Core hoisted to the root), the root and folders without a `package.json` of their own are refused, naming the workspace's apps that use Core with the `cd` to run from, so no theme lands outside an app. `undo <theme> radius-element` and `undo <theme> padding` suggest the token (`--radius-element`) or the property with its `--on <part>`, never a step back that undoes another change.

@josephfarina
