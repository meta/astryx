---
'@astryxdesign/cli': patch
---

[feat] `astryx template <name> <path>` names the components the written file uses in one line right after `Copied template to ...`: `Read the components it uses in one call: astryx component A B C`, so an agent reads them all in one call instead of one at a time. `astryx template <name>` prints the same line to stderr, so stdout stays the source. The names are the ones `astryx component` answers in the project (Core's and each configured integration's), in the order the file first renders them, each once, and in a project with an integration each is written as `<package>/<Name>` for the package its import names, so the read never opens another package's component; a chart library's parts and the file's own helpers are left out, and nothing prints when none are left. `--json` carries them as `components` on the `template.copy` receipt and as `componentsToRead` on `template.show`; every existing field is unchanged.

@josephfarina
