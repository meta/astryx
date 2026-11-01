---
'@astryxdesign/core': patch
---

[fix] A `Popover` in a Document Picture-in-Picture window now scrolls once that window gets too short for it or its content grows past it, instead of being cut off: it measures its overflow from the window it renders in, not the page.
@vjeux
