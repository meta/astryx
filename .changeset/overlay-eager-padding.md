---
'@astryxdesign/core': patch
---

[perf] Components that import Popover no longer load BottomSheet's container padding styles and focus helper up front. Popover loads a BottomSheet on demand for its phone presentation, and a bundler that splits code put the modules both of them use into one chunk that loads with the component, keeping every export either side uses: about 3.5 KB minified in Popover, Carousel, DateRangeInput, DropdownMenu, Table and the other components that import Popover or DropdownMenu. `paddingStyles` and `overlayPaddingReset` now have their own modules, still exported from `@astryxdesign/core/Layout/padding.stylex`, and `isFocusDetached` has its own module, still exported from `@astryxdesign/core/utils`. Rendering is unchanged.

@vjeux
