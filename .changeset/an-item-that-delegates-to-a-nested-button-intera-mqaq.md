---
'@astryxdesign/core': patch
---

[fix] An `Item` that delegates to a nested `Button` (`interactiveRef`) no longer rings the whole row while that Button has keyboard focus: the Button's own ring is the only one. A Button in the end content of a reorderable `List` row, or of a `CheckboxList` or `RadioList` option row, also shows only its own ring. A delegated control that shows no ring of its own, such as one inside `VisuallyHidden`, still gets the row's ring, and option rows keep their ring for their own checkbox or radio.
@kentonquatman
