---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` checks its `dropped-children` warning against the component's own docs. A component whose docs list no `children` prop is named as the one that dropped the text, even when the text sits inside another component (`<Badge><Text>New</Text></Badge>` names Badge), and the warning points to `astryx component <Name>`. Text inside a component that takes children, but that the first paint does not show yet (a collapsed Banner, an inactive tab or route), no longer warns. The warning's code does not change.

@josephfarina
