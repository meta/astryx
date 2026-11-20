---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: the generated icons module marks each adapter call and each theme-map element `/* @__PURE__ */`, so a bundler drops the icons an app does not use. Before, importing one icon from a set also bundled its whole theme map (and, for a set built with an adapter, every adapted icon). Modules written without the marks, or with `/*#__PURE__*/`, read the same; the next `experimental icon add`, `map`, or refresh adds the marks, keeps any mark a statement written by hand already carries, and changes nothing else. Set authors: author and check a set with this release or later. An earlier CLI misreads a module written with the marks: its `experimental icon add` and `map` drop the adapter import, its `new-set --from` refuses, and its `integration check` and `doctor integration validate <set package>` report `icon_generated_types_mismatch`. In an app on an earlier CLI, template copies, icon search and the default `doctor` run read a marked set as before; validating the set package itself fails until the app moves to this release.

@josephfarina
