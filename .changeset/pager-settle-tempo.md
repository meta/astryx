---
'@astryxdesign/core': patch
---

[fix] A page that a swipe releases now settles at the theme's `tempo`, as the rest of its motion does: in a `Carousel` given `hasSnap={useSnapPaging()}`, and in a `Lightbox` gallery. At the default tempo the settle is unchanged.

@vjeux
