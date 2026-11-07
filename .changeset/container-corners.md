---
'@astryxdesign/core': patch
---

[fix] A Table, or a List with `edge="bleed"`, that is the first or last child of a rounded Card, Dialog, or BottomSheet now rounds with the corner it reaches, so the table's focus ring stays whole at the container's corners instead of being cut off. Every other corner stays square: standalone, inside a square container or a wrapper element, or between other content.

@cixzhang
