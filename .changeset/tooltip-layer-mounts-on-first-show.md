---
'@astryxdesign/core': patch
---

[perf] A `Tooltip`, and every component's tooltip (`Button`, `IconButton`, `Link`, `InfoTip`, `Avatar`, a field's `disabledMessage` and status tooltips, `SideNavItem` in the collapsed rail and others), now mounts its layer at its first hover, focus or tap instead of with its trigger. A table with a tooltip on every row mounts no closed tooltip layers, so such a page loads faster. The trigger's `aria-describedby` now names a hidden copy of the tooltip text (a `hidden` element) rendered next to the trigger, so screen readers hear the description before the tooltip first shows and read it once after. A `useTooltip` trigger, which every Astryx component uses, and a `Tooltip` around plain text name the copy in server HTML; a `Tooltip` around an element, or with `anchorRef`, names it once the page hydrates. Tooltip content also renders once from mount as that hidden copy, so a component inside it runs its effects before the tooltip first shows. `useTooltip`'s `describedBy` is the id of that copy, not the tooltip element's id: code that looked up the tooltip with `document.getElementById(describedBy)` now gets the copy. A toggle-style trigger built on `show()` and `hide()` needs only `aria-describedby` and `aria-expanded`. Hover, focus and tap open the tooltip exactly as before.

@cixzhang
