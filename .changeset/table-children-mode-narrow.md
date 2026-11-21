---
'@astryxdesign/core': patch
---

[fix] A Table in children mode whose cells wrap (the default) now scrolls inside its own box when it does not fit, as a data-driven Table does, instead of shrinking every column until words break letter by letter and headings are cut. Its columns now follow their content instead of sharing the width equally. A children-mode Table with `textOverflow="truncate"` keeps its columns within its box and lays out as before.

@josephfarina
