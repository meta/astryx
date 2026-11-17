---
'@astryxdesign/cli': patch
---

[fix] When two installed packages both declare the same provider ID in their manifests, `astryx doctor` and the integration warnings now say they are one integration installed under two names and to keep one of the two dependencies, instead of saying to change a providerId.

@josephfarina
