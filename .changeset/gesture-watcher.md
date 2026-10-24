---
'@astryxdesign/core': patch
---

[experimental] New recognizer option `claimsTouches: false` makes a watcher: it never claims a touch, so it gets only passive listeners and never delays a scroll, it runs alongside every other recognizer, and it follows a touch the browser takes for a scroll to the lift.

@vjeux
