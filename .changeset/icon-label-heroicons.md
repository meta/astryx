---
'@astryxdesign/core': patch
---

[fix] Icon: a labelled icon component that hides itself by default, such as a Heroicons icon, is now exposed to assistive technology as an image with its `label`. Before, the component's own `aria-hidden="true"` stayed on the SVG and hid the label.

@cixzhang
