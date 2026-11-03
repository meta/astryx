---
'@astryxdesign/core': patch
---

[chore] Internal: a pager for touch presentations that pages like a UIKit paging scroll view. A horizontal pan moves the pages one to one and rubber-bands at the ends. The release picks the page with UIKit's rule and settles on UIKit's paging curve on the compositor, and a finger can catch it mid-flight. It takes every pointer: a mouse drags it as a finger does, and its pan follows a trackpad's horizontal scroll, at most one page per swipe. A mouse wheel's scroll stays the page's. Its motion values are internal constants. Not exported from the package entry point.

@vjeux
