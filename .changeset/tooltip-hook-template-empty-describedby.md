---
'@astryxdesign/cli': patch
---

[docs] The Tooltip hook block template now writes `aria-describedby={tooltip.describedBy || undefined}`, because Core's `useTooltip` returns an empty `describedBy` until the tooltip code loads after the page's first paint.

@cixzhang
