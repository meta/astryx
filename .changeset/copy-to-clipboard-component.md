---
'@astryxdesign/core': patch
---

[component] Add CopyToClipboard component

An icon-only button that copies text to the clipboard: the copy behavior is delegated to the existing useClipboard hook, the icon flips from copy to check while the copied confirmation is active, and the confirmation is announced to assistive technology. The accessible label and tooltip are localized and overridable via `label`.

@aashish
