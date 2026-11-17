---
'@astryxdesign/core': patch
---

[fix] An enabled `Item` that delegates to a nested `Button` (`interactiveRef`) no longer rings the whole row while that Button has keyboard focus: the Button's own ring is the only one. A Button in the end content of an enabled reorderable `List` row, or of an enabled `CheckboxList` or `RadioList` option row, also shows only its own ring. A disabled row keeps its ring as before. A delegated control that shows no ring of its own, such as one inside `VisuallyHidden`, still gets the row's ring, and option rows keep their ring for their own checkbox or radio.
@kentonquatman
