---
'@astryxdesign/cli': patch
---

[feat] Doc examples take an optional `kind: 'demo' | 'setup'` (default `'demo'`), on component, sub-component and function examples. A `setup` example is code that cannot run on its own, such as an app setup file, a server route, or a snippet that uses variables defined elsewhere: `astryx component <Name>` labels it "(setup, code only)", and a docs site shows it as code with no live preview. In `astryx component <Name> --json`, every example carries its `kind`. Any other value fails to load with a message that names both kinds. `astryx docs authoring` explains when to use `setup`.

@josephfarina
