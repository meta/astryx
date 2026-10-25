---
'@astryxdesign/core': patch
---

[fix] `ChatComposer`'s status bar announces through the shared own-content announcement module (`spec:AST-086` FR11–FR13). It still announces errors assertively and warnings politely, once per occasion, but a status that is already showing while the page loads is no longer announced, and it speaks the bar's rendered text without the decorative icon.

@cixzhang
