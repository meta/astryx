---
'@astryxdesign/core': patch
---

[chore] Internal: Table's row virtualization now runs on one shared list-windowing module inside Core, which later long lists will reuse. The undocumented `@astryxdesign/core/internal/virtualization` entry gives Lab the same module. Table's behavior and public API do not change. Internal entries are outside the public API and its compatibility promise.

@humbertovirtudes
@cixzhang
