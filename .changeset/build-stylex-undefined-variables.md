---
'@astryxdesign/build': patch
---

[feat] A production build with `astryxStylex` warns when its stylesheet reads a StyleX-generated custom property that nothing declares, naming the variable and the rule that reads it. The new `undefinedVariables` option (`'warn'` by default) set to `'error'` fails the build instead.

@vjeux
