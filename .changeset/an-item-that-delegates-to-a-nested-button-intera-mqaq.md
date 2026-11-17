---
'@astryxdesign/core': patch
---

[fix] An `Item` that delegates to a nested `Button` (`interactiveRef`) no longer rings the whole row while that Button has keyboard focus: the Button's own ring is the only one. A reorderable `List` row with a Button in its end content shows one ring the same way. A delegated control that draws no ring of its own, and the option rows of `CheckboxList` and `RadioList`, keep the row's ring.
@kentonquatman
