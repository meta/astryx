---
'@astryxdesign/core': patch
---

[fix] The motion clock follows the timeline that draws each motion. While DevTools slows animations, a read, a stop or a new target starts from the value on screen. Layout glides and Reduce Motion fades start on time. In an iframe or a second window, a motion starts at once, and a stop holds it in place. At full speed in the page itself, nothing changes.

@vjeux
