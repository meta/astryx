---
'@astryxdesign/core': patch
---

[perf] Under a finger, touch hit areas no longer watch the page. Each control's invisible band grows toward 44 px in CSS, and a group's members share the gap between them at its middle. Nothing measures before a press: when a tap on a band lies nearer a neighbouring control, the tap does nothing, so the wrong control never acts. A page with many touch controls reads no layout and starts no observer for them while it loads or scrolls.

@cixzhang
