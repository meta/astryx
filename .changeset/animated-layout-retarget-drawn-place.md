---
'@astryxdesign/core': patch
---

[fix] In Safari, content already gliding after a layout change no longer jumps ahead when a second change retargets it, such as a row that moves again while it is still moving: the new glide started up to about 3 px ahead of where the row was drawn, more the later in its frame the change was made. A gliding element's place before a change is now read on its glide's own clock, so the new glide starts where the old one is drawn.

@vjeux
