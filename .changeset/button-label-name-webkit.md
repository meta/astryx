---
'@astryxdesign/core': patch
---

[fix] A labelled `Button` has its accessible name again in VoiceOver on macOS 14 (Safari 17 and WKWebView). The label sat inside a `display: contents` wrapper, which that WebKit drops names through, so it read an unnamed "button". The wrapper is now a flex box that takes the Button's own layout, and the Button looks the same.

@cixzhang
