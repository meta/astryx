---
'@astryxdesign/core': patch
---

[fix] `Theme` keeps its runtime-injected CSS in the document until the last mounted `Theme` using that theme unmounts. Before, the `Theme` that injected the CSS first owned the shared `<style>` tags, so unmounting it (a nested `Theme` around a dialog that mounted first, for example) stripped the component overrides and prose defaults from every other `Theme` still using that theme. Built themes, which import their CSS as a file, are unaffected.

@thecodebasedot
