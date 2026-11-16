---
'@astryxdesign/cli': patch
---

[experimental] The icon-sets guide shows how to make a set inside your own app, with no other package to make, install, or publish. In a private package (`"private": true`), the `experimental icon new-set` receipt leaves out the publishing steps (peers, the `typecheck` script, the strict check's TypeScript, the placeholder description) and ends with the `experimental icon use <set>` step that turns the set on.

@josephfarina
