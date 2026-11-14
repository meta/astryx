---
'@astryxdesign/richtext': patch
---

[fix] Apps that install the rich text package no longer see "Warning: @astryxdesign/richtext has N integration issue(s)" on `astryx search`, `component`, `template`, `theme`, `discover` and `upgrade`. The editor's internal plugins now live in a folder the CLI does not read as components, so the integration check reports no issues. The public components and imports are unchanged.

@josephfarina
