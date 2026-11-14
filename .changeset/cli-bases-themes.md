---
'@astryxdesign/cli': patch
---

[feat] On a base other than Core, `theme targets`, `theme build`, and `theme add`, `use`, and `remove` call the base's `themes` adapter: `targets` returns the theming targets, `compile` returns the built files, and `appModule` returns the generated module's source. The CLI does every write. A base may list the steps an adapter serves with `adapters: {themes: {module, steps}}`; a plain path still serves every step. `@astryxdesign/cli/authoring` publishes the step contracts. A step that throws or returns a malformed result fails with the new `ERR_BASE_ADAPTER`, and a listed step the module does not export refuses with `reason: "not-exported"`.

@josephfarina
