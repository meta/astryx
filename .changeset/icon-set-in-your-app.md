---
'@astryxdesign/cli': patch
---

[experimental] The icon-sets guide shows how to make a set inside your own app, with no other package to make, install, or publish. When the package's own package.json sets `"private": true`, the `experimental icon new-set` receipt leaves out the publishing steps (peers, the `typecheck` script, the strict check's TypeScript, the placeholder description) and its notes end with the `experimental icon use <set>` step that turns the set on. Every other package gets the notes as before.

@josephfarina
