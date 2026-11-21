---
'@astryxdesign/core': patch
---

[fix] The motion clock follows the timeline that draws each motion. While DevTools slows animations, a read, a stop or a new target on the engine's own clock starts from the value on screen. Layout glides and Reduce Motion fades start on time. Motions on the engine's own clock follow the document they run in. In an iframe or second window, a drag's settle or a list reorder no longer stalls or jumps, even beside motions in the page. At full speed, when every motion is in the page, motions run as before.

@vjeux
