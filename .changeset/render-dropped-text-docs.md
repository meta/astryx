---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render` checks its `dropped-children` warning against Core's component docs. A Core component whose docs list no `children` prop is named as the one that dropped the text, even when the text sits inside another component (`<Badge><Text>New</Text></Badge>` names Badge), and the warning points to `astryx component <Name>`. Text that the first paint does not show yet (a collapsed Banner, an inactive tab or route) stops warning only when every component around it is a Core component whose docs list `children`. A text inside a page's own component, or another package's, keeps today's warning. The warning's code does not change.

@josephfarina
