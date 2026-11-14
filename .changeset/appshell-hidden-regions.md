---
'@astryxdesign/core': patch
---

[feat] AppShell takes `hiddenRegions?: ReadonlyArray<'topNav' | 'sideNav'>` to hide its top nav or side nav, for example for a focus mode, while they stay mounted. A hidden region takes no space, its contents are inert and keep their state, and focus inside it moves to the main content. The region slides out by its edge as the content takes its space, in one motion. On a phone, the drawer leaves out each hidden region, and its menu button goes when nothing is left to show. A region that hides while the drawer is open closes it, and revealing the region does not reopen it. MobileNav moves focus to main when the button that opened it is hidden.

@AKnassa @humbertovirtudes @cixzhang
