---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` now says when it leaves out a file the page imports because its name reads as a tool's configuration, such as `chart.config.json`. A new `not-carried` warning names the file and a name that carries it, such as `chart-data.json`. The note at the top of the file lists it under the carried files and no longer says the page comes back exactly. The JSON adds `notCarried`, present only when a file is left out this way.

@josephfarina
