---
'@astryxdesign/core': patch
---

[feat] Adapt NumberInput's compact steppers to primary-pointer precision: hide them on coarse pointers and restore the field's themed end padding. Fine-pointer steppers are unchanged.

Compatibility: this is a non-breaking presentation adaptation. The public props and exports, numeric value and callback contracts, validation, direct entry, and keyboard stepping remain unchanged; existing NumberInput calls require no source or configuration migration. Coarse-pointer users enter the value directly instead of using the compact visual stepper aids.

@imdreamrunner
