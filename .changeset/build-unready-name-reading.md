---
'@astryxdesign/cli': patch
---

[fix] `astryx build` with an idea that is a not-ready page template's name typed as one word or with its own separators (`MessagingShell`, `messaging-shell`) now gets the kit of ready pages, blocks and components that the name's words get, and its reason says the template is not ready yet. Before, search read the name as naming only that template, so the kit came back empty.

@josephfarina
