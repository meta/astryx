---
'@astryxdesign/core': patch
---

[fix] Spinner keeps turning while a script runs. The ring used to move by repainting its arc on the main thread every frame, so it stopped for as long as the page ran JavaScript, which is exactly when a loading indicator is on screen. The arc now sits in its own layer that the browser turns on its compositor: through a 700 ms main-thread block it keeps turning at full rate, and it paints nothing per frame. The ring looks the same at rest and turns at the same speed; sizes, shades, the themeable vars and reduced motion are unchanged.

@vjeux
