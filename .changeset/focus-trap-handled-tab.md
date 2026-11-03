---
'@astryxdesign/core': patch
---

[fix] Tab and Shift+Tab now reach every control in a `DropdownMenu` header or footer in an app whose React root is the document, such as a Next.js App Router app. Before, the popover's focus trap read the menu's Tab a second time and undid the move: Tab onto the last footer control went back to the menu, and Shift+Tab from the footer onto the menu went to the last footer control. `useFocusTrap` now leaves a Tab whose default is already prevented to the content that handled it.

@imdreamrunner
