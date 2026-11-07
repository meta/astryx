---
'@astryxdesign/core': patch
---

[fix] Layers with an entrance input hold: a finger or pen that was already down when a light-dismissing layer opened, and lifts while it enters, now lifts through the hold's shield onto what is under it in WebKit, so the layer dismisses as it already did in Chromium. The shield leaves a small opening at each such press until it lifts. New presses during the entrance are still held.

@cixzhang
