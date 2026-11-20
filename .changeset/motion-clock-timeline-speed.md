---
'@astryxdesign/core': patch
---

[fix] The motion clock follows the timeline that draws each motion. While DevTools slows animations, a read, a stop or a new target on the engine's own clock starts from the value on screen. Layout glides and Reduce Motion fades start on time. In an iframe or second window, a drag's settle, a list reorder and other motions on the engine's own clock no longer stall or jump. At full speed in the page itself, nothing changes.

@vjeux
