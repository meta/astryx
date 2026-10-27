---
'@astryxdesign/core': patch
---

[fix] `Theme` keeps its runtime-injected CSS in the document until the last mounted `Theme` using that theme unmounts. Before, the one instance that happened to inject first owned the shared `<style>` tags, so unmounting a nested or sibling `Theme` (a dialog wrapped in the same theme, for example) stripped the component overrides and prose defaults from every other `Theme` still on the page. Built themes, which import their CSS as a file, are unaffected.

@thecodebasedot
