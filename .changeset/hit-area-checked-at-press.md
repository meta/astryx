---
'@astryxdesign/core': patch
---

[perf] Under a finger, touch hit areas no longer watch the page. Each control's invisible band grows toward 44 px in CSS, and a group's members share the gap between them at its middle. Nothing measures before a press. At a tap, another control's visible box under the finger (a link, button, form field, or element with an interactive role or tab stop) wins over a band; a tap a band hands on to the field under the finger does not place the caret at the tap point. In empty space where bands overlap, the control whose box is nearest the finger takes the tap. A control in a list row's end slot grows no taller, so the row takes the taps above and below it. A page with many touch controls reads no layout and starts no observer for them while it loads or scrolls.

@cixzhang
