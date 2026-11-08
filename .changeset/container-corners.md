---
'@astryxdesign/core': patch
---

[fix] A Table, or a List with `edge="bleed"`, that is the first or last child of a rounded Card or Dialog that holds no other Table or bleeding List deeper inside now rounds with the corner it reaches, so the table's focus ring stays whole at the container's corners instead of being cut off. A bleeding List with a header rounds only its last row. Every other corner stays square: standalone, inside a square container or a wrapper element, between other content, at the top of a BottomSheet (below its grab bar), or while another Table or bleeding List sits deeper in the same container.

@cixzhang
