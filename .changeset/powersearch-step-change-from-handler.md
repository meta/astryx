---
'@astryxdesign/core': patch
---

[fix] PowerSearch's touch presentation moves focus and speaks a step change from the action that caused it. Focus moves once, to the control the step names, and the change's words are spoken once, in the step that shows. A later re-render that changes no step moves no focus and speaks nothing.

@cixzhang
