---
'@astryxdesign/core': patch
---

[fix] useContainerReveal keeps revealed content always visible only when the primary pointer is coarse (a phone or tablet). A touchscreen laptop used with a mouse or trackpad now reveals on hover and keyboard focus like any other mouse device. Previously any touchscreen kept the content visible at rest, so a Thumbnail's hover remove button, Markdown heading links, and every app's hover-revealed row actions never hid.
@shashank03-dev
