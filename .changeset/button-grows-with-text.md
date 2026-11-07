---
'@astryxdesign/core': patch
---

[fix] A labelled `Button`'s size is now a minimum height: a label larger than the element size grows the button, so the label stays inside it. At the default text size Buttons keep their size, and icon-only buttons keep their fixed square. A caller `height` override no longer brings a labelled Button below its size; override `minHeight` instead.

@cixzhang
