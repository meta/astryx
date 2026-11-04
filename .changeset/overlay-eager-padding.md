---
'@astryxdesign/core': patch
---

[perf] Popover, DropdownMenu, Carousel, ContextMenu, DateRangeInput, Markdown, MoreMenu and Table no longer load BottomSheet's container padding styles up front. Popover loads a BottomSheet on demand for its phone presentation, and a bundler that splits code put the padding module both of them use into one chunk that loads with the component, keeping every export either side uses. `paddingStyles` and `overlayPaddingReset` now have their own modules, still exported from `@astryxdesign/core/Layout/padding.stylex`, and `isFocusDetached` has its own module, still exported from `@astryxdesign/core/utils`. A component that uses BottomSheet's padding itself still loads it. Rendering is unchanged. (#8550)

@vjeux
