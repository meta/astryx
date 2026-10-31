---
'@astryxdesign/core': patch
---

[fix] A BottomSheet let go under a finger moves the way an iOS sheet does, on every touch device. It settles on the stop nearest where its speed carries it, a quick flick going at least to the next stop, with gone below the screen counting as a stop (one moving back toward where the drag began returns there), and on iOS's own release spring, starting at the finger's speed instead of from a standstill; under reduced motion it fades in place instead. Under a mouse a release keeps today's rule and the theme's duration and easing, on the same release speed as a finger's: a mouse held still for more than 40 ms before the release no longer throws the sheet. Everywhere, the settle runs on the compositor, so a busy page no longer stalls it, and a finger can catch the sheet while it settles, on iOS too. The finger's speed is read from when each touch happened rather than when the page got to it.

@vjeux
