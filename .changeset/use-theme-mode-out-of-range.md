---
'@astryxdesign/core': patch
---

[fix] useTheme: `mode` is always `'light'` or `'dark'`. A mode outside `light | dark | system`, such as a stale persisted preference, now resolves through the OS preference like `'system'` instead of being returned as is. First fixed in #5617.

@cixzhang @AKnassa
