---
'@astryxdesign/core': patch
---

[chore] The internal resize factory can drive a plain handle element: it gives the element the separator's role, name, value and tab stop, and answers its pointer drag, keys, Enter and double-click. ResizeHandle and the factory derive the separator's attributes from one helper, with no behavior change. (#9718)

@vjeux
