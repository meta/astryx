---
'@astryxdesign/core': patch
---

[perf] Button and IconButton load their tooltip code only when a person first hovers, focuses or presses a Button that has a `tooltip`. A page whose Buttons have no `tooltip` loads about 16 KB less gzipped JavaScript for Button. A Button with a `tooltip` shows it with the same delays. It is described by hidden text inside the Button from the first render, so screen readers hear the description before the tooltip code loads. A test that finds the tooltip by its text can now find that hidden text too; find the tooltip by its `tooltip` role.

@cixzhang
