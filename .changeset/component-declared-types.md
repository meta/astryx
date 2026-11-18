---
'@astryxdesign/cli': patch
---

[feat] `astryx component <Name>` shows the types its props name. A `## Types` section after the props lists each type the component's own package declares, read from the declaration files the package publishes: the `import type` line from the entry that exports it, then each member with its type, whether it is required and the first sentence of its doc comment, or an alias's text. It is one level deep and capped in length; a union of string literals (such as an icon name) is always printed whole. A type a prop names only as a callback's parameter, and a brand type whose members are all `never`, are left out. `--props` and `--detail full` print the section too, and a hook read, by `astryx hook <name>` or `astryx component <hook>`, prints it for the types the hook's parameters, return and declared signature name (`useToast`: `ToastOptions`, `ShowToastFn`). A piece of a family that another entry exports names its import, such as `Card` under `Layout`. `--json` gains an optional `types` field on `component.detail` and `hook.detail` (and beside `data` on `component.detail.props` and `hook.detail.params`), and an optional `import` on such a piece; a read that names no such type answers as before. Types from React, the DOM, TypeScript or another package get no entry, and a package that ships no declarations answers as before.

@josephfarina
