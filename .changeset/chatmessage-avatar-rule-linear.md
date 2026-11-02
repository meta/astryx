---
'@astryxdesign/core': patch
---

[fix] Safari no longer slows down as a page fills a container with many children because of ChatMessage's avatar-spacing rule. The avatar's top spacing beside a named bubble is now judged from the message itself instead of from its siblings. It looks exactly as before.

@cixzhang
