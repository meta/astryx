---
'@astryxdesign/build': patch
---

[feat] A production build with `astryxStylex` warns when its stylesheet reads a StyleX-generated custom property that nothing declares, naming the variable and the rule that reads it. It checks the class-name prefixes the build uses, `stylexOverrides.classNamePrefix` included, and never reports a custom property an app declares in its own CSS.

@vjeux
