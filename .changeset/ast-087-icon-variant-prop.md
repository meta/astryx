---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] `Icon` takes an optional `variant` (an `IconVariant` name) that requests the active theme's alternate artwork for a semantic icon: `<Icon icon="info" variant="filled" />`. The theme's icon entry receives the variant only when the active theme lists it in `iconVariants` and, for an inherited entry, the theme that defined the entry lists it too; otherwise it receives `undefined` and draws its normal artwork. `astryx theme build` keeps each inherited entry's defining list, so a built theme passes the same variants as its runtime theme. A `registerIcons()` entry receives the variants the active theme lists, and a node entry ignores `variant`. An icon component passed directly never receives `variant`, and `variant` is never written to the DOM or reflected on the `icon` theming target. Icons without `variant` render as before.
@imdreamrunner
