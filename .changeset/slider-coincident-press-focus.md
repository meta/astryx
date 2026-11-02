---
'@astryxdesign/core': patch
---

[fix] Slider: a press on the mark label of two coincident thumbs' shared value now goes to the upper thumb, as a press on the thumbs does, so a press that never moves leaves focus on the same thumb wherever it lands. Before, a press on that label went to the lower thumb, which the upper one covers.

@vjeux
