---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` names every file the page uses that the rendered file does not carry. A file left out because its name reads as a tool's configuration now gets the warning code `not-carried` instead of `not-embedded`. It says what carries the file: rename a `*.config.json`, such as `chart.config.json` to `chart-data.json`, or move the values the page reads from a tool's own file, such as `package.json`, into a file of its own. The note at the top of the file lists every left-out file on a "Not carried" line, and then no longer says the page comes back exactly. The JSON adds `notCarried`, and the text output shows it, both only when a file is left out.

@josephfarina
