---
'@astryxdesign/cli': patch
---

[feat] Outside a project, when a tool runs the CLI for you from its own package set, a page can use the other packages that set's `package.json` lists, such as an icon library, as it already uses Astryx, React and StyleX. `render` renders a scaffolded template page with nothing to install, and `template` no longer asks you to install those packages there. Before, `template` printed an `npm install` step for the template's icon library, and `render` stopped until you ran it.

@josephfarina
