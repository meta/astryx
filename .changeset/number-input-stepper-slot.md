---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] NumberInput steppers take their icon from the `number-input-stepper` slot. With no mapping, they still draw `numberInput:stepperDown`, including an existing override of that key. (#13103)

@N-Garai
