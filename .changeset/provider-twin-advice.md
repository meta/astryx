---
'@astryxdesign/cli': patch
---

[fix] When two installed packages both declare the same provider ID in their manifests, the warning and `astryx doctor`'s fix now say that if they are one integration installed under two names, keep one of the two dependencies, and otherwise change one package's providerId. When a provider ID comes from a package name, the advice is unchanged.

@josephfarina
