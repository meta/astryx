---
'@astryxdesign/core': patch
---

[fix] A theme's `borderRadius` and `padding` on the `chat-composer` target now also set the composer's `--_chat-composer-radius` and `--_chat-composer-padding`, so the composer body, its status strip, and the concentric send and attach button radius follow the theme. With `density="compact"`, the body keeps its compact padding, and its radius still follows. Before, the derived-variable registry filed these two mappings under `chat`, a key no element renders, so `defineTheme({components: {'chat-composer': {base: {borderRadius: '16px', padding: '8px'}}}})` emitted only `border-radius` and `padding` on the composer root, and everything that reads the two variables kept the default geometry.

@utsavo-afk
