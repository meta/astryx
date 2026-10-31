---
'@astryxdesign/core': patch
---

[fix] `Step` and `Stepper` reflect `disabled` state on the `step` and `step-indicator` theming targets when `isDisabled` is true (`architecture:component-theming-surface` INV6; `component:Stepper` FR10; `component:Step` FR6). This enables themes to restyle disabled steps and indicators in compact horizontal layouts where inactive step labels are omitted.

@Geervan
