---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` (and Core's palette source it is generated from) measures a status role's border like its icon, so a role whose border reads at no shade keeps the base theme's colors, as one whose icon reads at no shade already does. Every border and icon take the same search, so no theme output changes.

@josephfarina
