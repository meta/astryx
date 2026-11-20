---
'@astryxdesign/cli': patch
---

[experimental] Where icon features are on (an icon-set package is installed or `experimental.iconSet` is set), the agent block that `astryx init` and `astryx upgrade` write adds one line under the runner line: "Need an icon? Run `astryx experimental icon <what it means>` and paste the import it prints, instead of copying one from a template or other code." Where they are off, the block does not change.

@josephfarina
