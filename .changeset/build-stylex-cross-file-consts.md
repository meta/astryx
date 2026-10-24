---
'@astryxdesign/build': patch
---

[fix] `astryxStylex` resolves `defineConsts` values read from another file. With the `{stylexOptions}` form (the one Storybook uses), a file that read only constants from a `.stylex.ts` module lost that import once StyleX compiled it, so the constants never reached the CSS: a constant used as a media-query key failed the build ("Invalid empty selector") and one used as a value shipped as a custom property nothing declares. A constant defined on the library side of the layer split and read on the product side stayed unresolved in either form. A production build now also warns, naming the variable and the rule that reads it, when its stylesheet reads a StyleX-generated custom property that nothing declares; set `undefinedVariables: 'error'` to fail the build instead.

@vjeux
