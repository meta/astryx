---
'@astryxdesign/core': patch
---

[feat] SideNav's `collapsible` config takes `collapsedWidth?: 'rail' | 0`. `'rail'`, the default, keeps the icon rail. `0` hides the collapsed nav completely: it takes no width, its contents are inert, it slides out by its inline edge, and focus inside it moves to a SideNavCollapseButton rendered outside the nav with the same controlled config.

@AKnassa @cixzhang
