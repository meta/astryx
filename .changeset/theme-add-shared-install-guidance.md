---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add` with a shared theme follows an integration's install guidance: in a project whose integration says how it adds packages, the command installs nothing with the package manager and names that line for the Astryx base packages and any others the theme imports (`data.copy.installGuidance`).

@josephfarina
