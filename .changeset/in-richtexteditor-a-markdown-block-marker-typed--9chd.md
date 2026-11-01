---
'@astryxdesign/richtext': patch
---

[feat] In `RichTextEditor`, a Markdown block marker typed at the start of a list item now re-marks it and keeps its text: `- `, `1. `, or `[ ] ` switches the item's list between bullets, numbers, and tasks, and `# ` or `> ` takes the item out of its list as a heading or a quote, the rest of the list continuing after it. Each change is one undo step, back to the marker as typed.
@emilyhorsman @ernestt
