---
'@astryxdesign/core': patch
---

[fix] Skeleton keeps pulsing in Safari while a script runs. Its stepped pulse used a `steps()` timing function, which Safari never animates off the main thread, so the placeholders froze for as long as the page ran JavaScript; Chromium and Firefox were unaffected. The same ten steps are now written as keyframes with a linear timing function, which every engine animates on its compositor. The pulse looks and times exactly as before, including its stagger and reduced-motion behavior.

@vjeux
