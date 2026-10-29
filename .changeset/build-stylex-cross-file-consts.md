---
'@astryxdesign/build': patch
---

[fix] `astryxStylex` resolves `defineConsts` values read from another file. With the `{stylexOptions}` form (the one Storybook uses), a file that read only constants from a `.stylex.ts` module lost that import once StyleX compiled it, so the constants never reached the CSS: a constant used as a media-query key failed the build ("Invalid empty selector") and one used as a value shipped as a custom property nothing declares. In either form, a constant defined on the other side of the layer split, or in an Astryx package (compiled with the library class-name prefix) and read from an app file (compiled with its own), stayed unresolved. The `{stylexOptions}` form now passes StyleX `treeshakeCompensation: true` by default (before, its babel pass ran with StyleX's default, `false`), as the plugin form already does; pass `treeshakeCompensation: false` in `stylexOptions` to restore the old behavior.

@vjeux
