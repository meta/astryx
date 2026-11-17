---
'@astryxdesign/core': patch
---

[fix] Toolbar: the arrow keys reach every control in a toolbar that holds a SegmentedControl, a TabList, or Pagination's dots. At its first and last item the nested control no longer wraps on the toolbar's arrow keys; it leaves the key to the toolbar, which moves focus to the next control. Before, the arrow keys stayed inside the nested control and the toolbar's other controls could not be reached from the keyboard. Outside a toolbar these controls wrap as before. `useListFocus` does the same for any list inside a `role="toolbar"`.

@kyu-rong
