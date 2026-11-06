---
'@astryxdesign/core': patch
---

[fix] A quick flick toward a toast's edge now dismisses it whatever its height. Before, a flick also had to travel 48 px (the distance that already dismisses a one-line toast), so on any toast up to 120 px tall a flick could only snap back; and its speed was timed by when the browser handled the touches rather than when they happened, which in browsers that deliver moves on the next frame made a quick flick look up to twice as slow.

@vjeux
