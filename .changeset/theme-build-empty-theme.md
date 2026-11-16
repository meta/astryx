---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a plain-object theme with no `tokens`, a name alone (`export default {name: 'p'}`) or a name and component styles, builds as an empty theme over the base instead of ending with "Cannot convert undefined or null to object".

@josephfarina
