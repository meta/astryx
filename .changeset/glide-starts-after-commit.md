---
'@astryxdesign/core': patch
---

[fix] A layout glide (`useAnimatedLayout`) that a change starts from rest now starts at the content's old place. It starts with the first frame drawn after that change's task. Before, a long task after the change made the first drawn frame show the glide partway or at its end, so the content jumped. A slow commit or a later event listener is such a task. A glide retargeted while it runs keeps the motion it carries. No API changes.

@vjeux
