---
'@astryxdesign/core': patch
---

[fix] MetadataList passes a caller's `aria-label`, `aria-labelledby` and `aria-describedby` to the `dl`, so the list carries its accessible name and description (WCAG 2.2 SC 4.1.2, Name, Role, Value). Before, they landed on the root `div`, where assistive technology does not reliably announce a name. Other props stay on the root `div`.

@ravindrasinghshah
