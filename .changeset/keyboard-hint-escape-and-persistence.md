---
'@astryxdesign/core': patch
---

[fix] The arrow-key hint that Toolbar, TabList and SegmentedControl show on first keyboard focus now stays until you press an arrow key or Escape, or move focus out of the group (WCAG 2.2 SC 1.4.13 Content on Hover or Focus). It used to disappear after 3 seconds, sometimes before it could be read, and Escape did not close it. Escape now closes only the hint, through the shared layer dismissal stack, and keeps focus where it is. `useKeyboardHint`'s `dismissAfterMs` no longer defaults to 3000; leave it unset.

@cixzhang
