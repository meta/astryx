---
'@astryxdesign/core': patch
---

[fix] DateInput: under a finger, a bottom-sheet wheel's turn onto a tapped row, a key's row or a value set from outside now plays the shared settle spring from rest, instead of a fixed 300 ms ease-in-ease-out. The wheel's main interaction is a gesture, so all its motion springs; a flick's coast and a slow release's snap stay as they are.

@vjeux
