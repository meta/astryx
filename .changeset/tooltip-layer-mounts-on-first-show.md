---
'@astryxdesign/core': patch
---

[perf] A `Tooltip`, and every component's tooltip (`Button`, `IconButton`, `Link`, `InfoTip`, `Avatar`, a field's `disabledMessage` and status tooltips, `SideNavItem` in the collapsed rail and others), now mounts its layer at its first hover, focus or tap instead of with its trigger. A table with a tooltip on every row mounts no closed tooltip layers, which kept such pages busy for seconds. Until a tooltip first opens, its trigger's `aria-describedby` names hidden text with the same content, so screen readers read the same description. Hover, focus and tap open the tooltip exactly as before.

@cixzhang
