---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: the generated icons module marks each adapter call and each theme-map element `/* @__PURE__ */`, so a bundler drops the icons an app does not use. Before, importing one icon from a set also bundled its whole theme map (and, for a set built with an adapter, every adapted icon). Modules written without the marks, or with `/*#__PURE__*/`, read the same; the next `experimental icon add`, `map`, or refresh adds the marks and changes nothing else. Apps that use a marked set with an earlier CLI are unaffected (template copies, icon search and doctor read it as before); only an earlier CLI's `integration check` on the set's own package reports `icon_generated_types_mismatch`, so set authors check with this release or later.

@josephfarina
