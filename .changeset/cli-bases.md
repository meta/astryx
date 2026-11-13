---
'@astryxdesign/cli': patch
---

[feat] Bases, first step: a run resolves one base. The new global `--base <package>` picks it; otherwise, in an integration package, the base it is or builds on; else the project's Core; else its one installed base; else Core. A package becomes a base by declaring `base` in its integration manifest. Commands and options that need a platform step the base does not serve (theme build, add, use, remove, targets, and template; `template --skeleton` and `--cdn`; `integration add theme`; `experimental render`) are hidden from help and refused with `ERR_BASE_CAPABILITY`. Commands do not call base adapters yet, so a base other than Core serves no platform step. In a run on another base, component, hook, swizzle, template, docs, search, and codemod reads leave out Core's items and answer from the integrations that build on the base (an empty list or an unknown name). `build` still names Core's layout and foundation components, the `hook --list` and `swizzle --list` envelopes name Core as their package, and `upgrade --from` reads Core's installed version as its target. A project with no base-declaring integration answers exactly as before.

@josephfarina
