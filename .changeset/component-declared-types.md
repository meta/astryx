---
'@astryxdesign/cli': patch
---

[feat] `astryx component <Name>` shows the types its props name. A `## Types` section after the props lists each type the component's own package declares, read from the declaration files the package publishes: the `import type` line from the entry that exports it, then each member with its type, whether it is required and the first sentence of its doc comment, or an alias's text. It is one level deep and capped in length. `--props` and `--detail full` print it too. A piece of a family that another entry exports names its import, such as `Card` under `Layout`. `--json` gains an optional `types` field on `component.detail` (and beside `data` on `component.detail.props`), and an optional `import` on such a piece; a component whose props name no such type answers as before. Types from React, the DOM, TypeScript or another package get no entry, and a package that ships no declarations answers as before.

@josephfarina
