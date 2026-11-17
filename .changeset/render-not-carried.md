---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` now names every file the page uses that the file does not carry, so `--reverse` cannot give it back. A file left out because its name reads as a tool's configuration, such as `chart.config.json`, gets a new `not-carried` warning that names a name that carries it, such as `chart-data.json`. The note at the top of the file lists each left-out file under the carried files, and then no longer says the page comes back exactly. The JSON adds `notCarried`, present only when a file is left out.

@josephfarina
