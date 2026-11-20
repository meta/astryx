---
'@astryxdesign/core': patch
---

[fix] The motion clock follows the timeline that draws each motion. While DevTools slows animations, a read, a stop or a new target starts from the value on screen. Layout glides and Reduce Motion fades start on time. Inside an iframe or a second window, animations such as a drag's settle or a list reorder no longer stall or jump. At full speed in the page itself, nothing changes.

@vjeux
