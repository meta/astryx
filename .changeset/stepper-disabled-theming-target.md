---
'@astryxdesign/core': patch
---

[fix] A disabled `Step` now reflects `disabled` on the `step-indicator` theming target, beside `step-label`, so a theme can restyle a disabled step's indicator. In a compact horizontal `Stepper` with on-track indicators, where a disabled step's label is not shown, the indicator is the only target a theme can reach. The `step` and `step-description` targets do not gain the selector. (#8997)

@Geervan @duytbp
