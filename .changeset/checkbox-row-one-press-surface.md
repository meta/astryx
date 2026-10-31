---
'@astryxdesign/core': patch
---

[fix] On a touch screen, a CheckboxList row now answers a finger the same way wherever it lands. Under a finger, pressing a row's label painted the whole row while pressing its box painted only the box; under a coarse primary pointer the row is now the one touch press surface, so the row and its checkbox show the pressed state together whether the finger lands on the label, the description or the box. Where the primary pointer is fine (a mouse, a trackpad, or a pen on a desktop page), the box keeps its own press and hover, as before.

@vjeux
