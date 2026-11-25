---
'@astryxdesign/core': patch
---

[fix] ListInput's empty state reads right with any noun. Its title is "No {itemName} added yet", not "No {itemName}s yet", and its text is "Each {itemName} you add appears here.", not "Add a {itemName} to get started.": with "email address" it read "No email addresss yet" and "Add a email address". Both messages keep their `{itemName}` placeholder.

@ernestt
