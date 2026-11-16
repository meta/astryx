---
'@astryxdesign/core': patch
---

[perf] A `Tooltip`, and every component's tooltip (`Button`, `IconButton`, `Link`, `InfoTip`, `Avatar`, a field's `disabledMessage` and status tooltips, `SideNavItem` in the collapsed rail and others), now mounts its layer at its first hover, focus or tap instead of with its trigger. A table with a tooltip on every row mounts no closed tooltip layers, which cuts about a fifth of the long-task time such a page spends loading (about 250 ms on a 100-row table with five tooltips per row, at 4× CPU slowdown). Until a tooltip first opens, its trigger's `aria-describedby` names a hidden copy of the same content, so screen readers read the same description; a server render names no description until it hydrates. `useTooltip`'s `describedBy` is empty in a server render and the render that hydrates it, so leave the attribute off when it is empty (`aria-describedby={tooltip.describedBy || undefined}`). Hover, focus and tap open the tooltip exactly as before.

@cixzhang
