---
'@astryxdesign/core': patch
---

[fix] Carousel's scroll area is a group named like the carousel, so a screen-reader user who tabs onto it hears where they are. It is a tab stop only while its content overflows; a carousel that fits no longer adds an empty stop.

@vjeux
